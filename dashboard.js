
// Initialize Supabase Client
const supabaseUrl = 'https://hyqyauuqfadburdbysnp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5cXlhdXVxZmFkYnVyZGJ5c25wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5ODM0NTAsImV4cCI6MjA3OTU1OTQ1MH0.R51I6obHbh24VNmV9gc-Uh449ozmPPPLA3wJfDsk6b4'; // Anon Key
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

let currentUser = null;
let currentRole = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Check for existing session
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (session) {
        handleLoginSuccess(session.user);
    } else {
        showLogin();
    }

    // Login Form Handler
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const errorMsg = document.getElementById('login-error');

        errorMsg.textContent = '';

        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            errorMsg.textContent = error.message;
        } else {
            handleLoginSuccess(data.user);
        }
    });

    // Logout Handler
    document.getElementById('logout-btn').addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        window.location.reload();
    });

    // Create User Handler
    document.getElementById('create-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('new-user-email').value;
        const password = document.getElementById('new-user-password').value;
        const role = document.getElementById('new-user-role').value;
        const msg = document.getElementById('create-user-message');

        msg.textContent = 'Creating user...';
        msg.style.color = 'blue';

        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            const response = await fetch(`${supabaseUrl}/functions/v1/create-user`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ email, password, role })
            });

            const result = await response.json();

            if (result.success) {
                msg.textContent = 'User created successfully!';
                msg.style.color = 'green';
                document.getElementById('create-user-form').reset();
            } else {
                msg.textContent = `Error: ${result.message}`;
                msg.style.color = 'red';
            }
        } catch (error) {
            console.error(error);
            msg.textContent = 'An error occurred.';
            msg.style.color = 'red';
        }
    });
});

async function handleLoginSuccess(user) {
    currentUser = user;
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('dashboard-view').classList.remove('hidden');
    document.getElementById('user-email').textContent = user.email;

    // Fetch Role
    const { data: roleData, error } = await supabaseClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();

    if (roleData) {
        currentRole = roleData.role;
        document.getElementById('user-role').textContent = `Role: ${currentRole.toUpperCase()}`;

        // Hide User Management if not Admin
        if (currentRole !== 'admin') {
            document.getElementById('users-tab-btn').style.display = 'none';
        }
    } else {
        document.getElementById('user-role').textContent = 'Role: Unknown';
    }

    loadResponses();
}

function showLogin() {
    document.getElementById('login-view').classList.remove('hidden');
    document.getElementById('dashboard-view').classList.add('hidden');
}

function switchTab(tabName) {
    const tabs = ['responses', 'users'];
    tabs.forEach(t => {
        const el = document.getElementById(`${t}-tab`);
        const btn = document.querySelector(`button[onclick="switchTab('${t}')"]`);
        if (t === tabName) {
            el.classList.remove('hidden');
            if (btn) btn.classList.add('active');
        } else {
            el.classList.add('hidden');
            if (btn) btn.classList.remove('active');
        }
    });
}

async function loadResponses() {
    const filterType = document.getElementById('filter-type').value;
    let query = supabaseClient
        .from('form_responses')
        .select('*')
        .order('created_at', { ascending: false });

    if (filterType !== 'all') {
        query = query.eq('form_type', filterType);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching responses:', error);
        return;
    }

    const tbody = document.querySelector('#responses-table tbody');
    tbody.innerHTML = '';

    data.forEach(response => {
        const tr = document.createElement('tr');
        const date = new Date(response.created_at).toLocaleString();

        // Create a summary from the data
        let summary = '';
        if (response.data.name) summary += response.data.name;
        if (response.data.email) summary += ` (${response.data.email})`;

        tr.innerHTML = `
            <td>${date}</td>
            <td>${response.form_type}</td>
            <td>${summary}</td>
            <td class="status-${response.status}">${response.status}</td>
            <td>
                <button class="btn" onclick='viewResponse(${JSON.stringify(response).replace(/'/g, "&#39;")})' style="padding: 0.25rem 0.5rem; font-size: 0.8rem;">View</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function viewResponse(response) {
    const modal = document.getElementById('response-modal');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    const markReadBtn = document.getElementById('mark-read-btn');

    title.textContent = `${response.form_type} - ${new Date(response.created_at).toLocaleString()}`;

    let html = '<table style="width:100%">';
    for (const [key, value] of Object.entries(response.data)) {
        html += `<tr><td style="font-weight:bold; width: 30%;">${key}</td><td>${value}</td></tr>`;
    }
    html += '</table>';
    body.innerHTML = html;

    markReadBtn.onclick = async () => {
        const { error } = await supabaseClient
            .from('form_responses')
            .update({ status: 'read' })
            .eq('id', response.id);

        if (!error) {
            response.status = 'read'; // Update local
            loadResponses(); // Refresh list
            closeModal();
        }
    };

    modal.classList.remove('hidden');
}

function closeModal() {
    document.getElementById('response-modal').classList.add('hidden');
}

// Close modal when clicking outside
window.onclick = function (event) {
    const modal = document.getElementById('response-modal');
    if (event.target == modal) {
        closeModal();
    }
}
