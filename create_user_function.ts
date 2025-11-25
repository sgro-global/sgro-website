import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // 1. Verify the requester is an Admin
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            throw new Error('Missing Authorization header');
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);

        if (userError || !user) {
            throw new Error('Invalid token');
        }

        const { data: roles, error: roleError } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .single();

        if (roleError || roles?.role !== 'admin') {
            return new Response(JSON.stringify({
                success: false,
                message: 'Unauthorized: Only admins can create users.'
            }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 2. Parse Input
        const { email, password, role } = await req.json();

        if (!email || !password || !role) {
            return new Response(JSON.stringify({
                success: false,
                message: 'Missing email, password, or role'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const validRoles = ['admin', 'editor', 'commenter', 'viewer'];
        if (!validRoles.includes(role)) {
            return new Response(JSON.stringify({
                success: false,
                message: 'Invalid role'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 3. Create User
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true
        });

        if (createError) {
            throw createError;
        }

        if (!newUser.user) {
            throw new Error('Failed to create user object');
        }

        // 4. Assign Role
        const { error: assignError } = await supabase
            .from('user_roles')
            .insert({
                user_id: newUser.user.id,
                role: role
            });

        if (assignError) {
            // Rollback user creation if role assignment fails?
            // For now, just report error. Manual cleanup might be needed.
            console.error('Role assignment failed:', assignError);
            await supabase.auth.admin.deleteUser(newUser.user.id);
            throw new Error('Failed to assign role');
        }

        return new Response(JSON.stringify({
            success: true,
            message: 'User created successfully',
            user: {
                id: newUser.user.id,
                email: newUser.user.email,
                role: role
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error creating user:', error);
        return new Response(JSON.stringify({
            success: false,
            message: error.message || 'Internal Server Error'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
