import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // 1. Rate Limiting
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const ip = req.headers.get('x-forwarded-for') || 'unknown';
        const endpoint = 'submit-form';

        // Check rate limit (e.g., 5 requests per hour)
        const { data: rateLimit, error: rateLimitError } = await supabase
            .from('rate_limits')
            .select('*')
            .eq('ip_address', ip)
            .eq('endpoint', endpoint)
            .single();

        if (rateLimitError && rateLimitError.code !== 'PGRST116') {
            console.error('Rate limit check error:', rateLimitError);
            // Proceed cautiously or fail open? Let's fail open but log it.
        }

        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

        if (rateLimit) {
            if (new Date(rateLimit.last_request_at) > oneHourAgo) {
                if (rateLimit.request_count >= 5) {
                    return new Response(JSON.stringify({
                        success: false,
                        message: 'Too many requests. Please try again later.'
                    }), {
                        status: 429,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }
                // Increment count
                await supabase.from('rate_limits').update({
                    request_count: rateLimit.request_count + 1,
                    last_request_at: now.toISOString()
                }).eq('id', rateLimit.id);
            } else {
                // Reset count
                await supabase.from('rate_limits').update({
                    request_count: 1,
                    last_request_at: now.toISOString()
                }).eq('id', rateLimit.id);
            }
        } else {
            // Create new entry
            await supabase.from('rate_limits').insert({
                ip_address: ip,
                endpoint: endpoint,
                request_count: 1,
                last_request_at: now.toISOString()
            });
        }

        // 2. Parse Input (JSON or FormData)
        const contentType = req.headers.get('content-type') || '';
        let formType, formData;
        let resumeUrl = null;

        if (contentType.includes('application/json')) {
            const body = await req.json();
            formType = body.formType;
            const { formType: _, ...rest } = body;
            formData = rest;
        } else if (contentType.includes('multipart/form-data')) {
            const form = await req.formData();
            formType = form.get('formType');
            formData = {};

            for (const [key, value] of form.entries()) {
                if (key === 'formType') continue;

                if (value instanceof File) {
                    // Upload file to Supabase Storage
                    const fileExt = value.name.split('.').pop();
                    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
                    const filePath = `${fileName}`;

                    const { data: uploadData, error: uploadError } = await supabase
                        .storage
                        .from('resumes')
                        .upload(filePath, value, {
                            contentType: value.type,
                            upsert: false
                        });

                    if (uploadError) {
                        console.error('File upload error:', uploadError);
                        // Continue but note the error? Or fail?
                        // Let's add a note to the formData
                        formData[key] = `[Upload Failed: ${uploadError.message}]`;
                    } else {
                        // Get Public URL
                        const { data: { publicUrl } } = supabase
                            .storage
                            .from('resumes')
                            .getPublicUrl(filePath);

                        formData[key] = `[File Uploaded] ${value.name}`;
                        resumeUrl = publicUrl;
                    }
                } else {
                    formData[key] = value;
                }
            }
        } else {
            return new Response(JSON.stringify({
                success: false,
                message: 'Unsupported Content-Type'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        if (!formType) {
            return new Response(JSON.stringify({
                success: false,
                message: 'Missing formType'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 3. Determine Webhook URL from Secrets
        const typeKey = formType.toLowerCase().replace(/\s+form$/, '').replace(/\s+/g, '-');
        let webhookUrl = Deno.env.get('SLACK_NOTIFICATION_URL'); // Default

        // Map keys to specific env vars
        const webhookEnvMap: Record<string, string> = {
            'contact': 'SLACK_WEBHOOK_CONTACT',
            'join-club': 'SLACK_WEBHOOK_JOIN_CLUB',
            'join-school': 'SLACK_WEBHOOK_JOIN_SCHOOL',
            'join-member': 'SLACK_WEBHOOK_JOIN_MEMBER'
        };

        if (webhookEnvMap[typeKey]) {
            const specificUrl = Deno.env.get(webhookEnvMap[typeKey]);
            if (specificUrl) webhookUrl = specificUrl;
        }

        if (!webhookUrl) {
            console.error('Missing Slack Webhook URL configuration');
            return new Response(JSON.stringify({
                success: false,
                message: 'Server Configuration Error'
            }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 3.5 Insert into Database
        const { error: dbError } = await supabase
            .from('form_responses')
            .insert({
                form_type: formType,
                data: formData,
                status: 'new'
            });

        if (dbError) {
            console.error('Database insertion error:', dbError);
            throw new Error(`Database Error: ${dbError.message}`);
        }

        // 4. Send to Slack
        const blocks = [
            {
                type: "header",
                text: {
                    type: "plain_text",
                    text: `New Submission: ${formType}`,
                    emoji: true
                }
            },
            {
                type: "section",
                fields: Object.entries(formData).map(([key, value]) => ({
                    type: "mrkdwn",
                    text: `*${key}:*\n${value}`
                }))
            }
        ];

        if (resumeUrl) {
            blocks.push({
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*Resume/CV:*\n<${resumeUrl}|Download File>`
                }
            });
        }

        const messageBody = {
            text: `New Form Submission: ${formType}`,
            blocks: blocks
        };

        const slackResponse = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(messageBody)
        });

        if (!slackResponse.ok) {
            throw new Error(`Slack API Error: ${slackResponse.status} ${await slackResponse.text()}`);
        }

        return new Response(JSON.stringify({
            success: true,
            message: 'Form submitted successfully'
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({
            success: false,
            message: `Internal Server Error: ${error instanceof Error ? error.message : String(error)}`
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
