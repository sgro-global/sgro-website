document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, fetching content.json...');
  fetch('content.json')
    .then(response => {
      console.log('content.json fetched', response);
      return response.json();
    })
    .then(data => {
      console.log('content.json parsed:', data);
      loadHeader(data.header);
      loadFooter(data.footer);

      const urlParams = new URLSearchParams(window.location.search);
      const formType = urlParams.get('type');
      console.log('Form type from URL:', formType);

      if (formType) {
        if (data.forms && data.forms[formType]) {
          console.log('Loading form:', formType, data.forms[formType]);
          loadDynamicForm(data.forms[formType], formType);
        } else {
          console.error('Form type not found:', formType);
          document.getElementById('form-title').textContent = 'Form Not Found';
        }
      } else {
        // Only load main page content if NOT on a form page (or if we want to support both, check path)
        // For simplicity, we check if elements exist before loading
        if (document.getElementById('hero-title')) loadHero(data.hero);
        if (document.getElementById('about-title')) loadAbout(data.about);
        if (document.getElementById('action-title')) loadActionPlan(data.actionPlan);
        if (document.getElementById('gallery-title')) loadGallery(data.gallery);
        if (document.getElementById('join-title')) loadJoin(data.join);
        if (document.getElementById('contact-title')) loadContact(data.contact);
      }
    })
    .catch(error => {
      console.error('Error loading content:', error);
      // Show error to user on form page
      const formTitle = document.getElementById('form-title');
      if (formTitle) {
        formTitle.textContent = 'Error loading form. Please refresh the page.';
      }
    });
});

function loadDynamicForm(formData, formTypeKey) {
  document.getElementById('form-title').textContent = formData.title;
  const form = document.getElementById('dynamic-form');
  const submitBtn = document.getElementById('form-submit');
  submitBtn.textContent = formData.submitText;

  formData.fields.forEach(field => {
    const div = document.createElement('div');
    div.className = 'form-group';

    const label = document.createElement('label');
    label.htmlFor = field.id;
    label.textContent = field.label;

    let input;
    if (field.type === 'textarea') {
      input = document.createElement('textarea');
    } else if (field.type === 'file') {
      input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf,.doc,.docx';
    } else {
      input = document.createElement('input');
      input.type = field.type;
    }
    input.id = field.id;
    input.name = field.id;
    if (field.required !== false) {
      input.required = true;
    }

    div.appendChild(label);
    div.appendChild(input);

    form.insertBefore(div, submitBtn);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    const payload = new FormData(form);
    payload.append('formType', formData.title || formTypeKey);

    try {
      const response = await fetch('https://hyqyauuqfadburdbysnp.supabase.co/functions/v1/submit-form', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5cXlhdXVxZmFkYnVyZGJ5c25wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5ODM0NTAsImV4cCI6MjA3OTU1OTQ1MH0.R51I6obHbh24VNmV9gc-Uh449ozmPPPLA3wJfDsk6b4'
        },
        body: payload
      });

      const result = await response.json();

      if (result.success) {
        alert('Form submitted successfully!');
        form.reset();
      } else {
        alert(`Failed to submit form: ${result.message}`);
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      alert('An error occurred. Please try again later.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = formData.submitText;
    }
  });
}

function loadHeader(data) {
  const navList = document.getElementById('nav-list');
  data.nav.forEach(item => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = item.link;
    a.textContent = item.text;
    li.appendChild(a);
    navList.appendChild(li);
  });
}

function loadHero(data) {
  document.getElementById('hero-title').textContent = data.title;
  document.getElementById('hero-subtitle').textContent = data.subtitle;
  const cta = document.getElementById('hero-cta');
  cta.textContent = data.ctaText;
  cta.href = data.ctaLink;

  if (data.heroImage) {
    document.getElementById('hero-bg').style.backgroundImage = `url('${data.heroImage}')`;
  }
}

function loadAbout(data) {
  document.getElementById('about-title').textContent = data.title;
  document.getElementById('about-description').innerHTML = data.description;
  document.getElementById('about-mission').textContent = data.mission;
  document.getElementById('about-problem').textContent = data.problem;
  document.getElementById('about-solution').textContent = data.solution;

  if (data.aboutImage) {
    document.getElementById('about-img').src = data.aboutImage;
  }

  const grid = document.getElementById('principles-grid');
  data.principles.forEach(principle => {
    const card = document.createElement('div');
    card.className = 'principle-card';
    card.innerHTML = `
            <h3>${principle.title}</h3>
            <p>${principle.text}</p>
        `;
    grid.appendChild(card);
  });
}

function loadActionPlan(data) {
  document.getElementById('action-title').textContent = data.title;
  document.getElementById('action-description').textContent = data.description;
  document.getElementById('action-support').textContent = data.support;

  if (data.actionImage) {
    document.getElementById('action-bg').style.backgroundImage = `url('${data.actionImage}')`;
  }
}

function loadGallery(data) {
  document.getElementById('gallery-title').textContent = data.title;
  const grid = document.getElementById('gallery-grid');
  data.images.forEach(imgSrc => {
    const img = document.createElement('img');
    img.src = imgSrc;
    img.alt = "SGRO Community";
    img.className = "gallery-img";
    grid.appendChild(img);
  });
}

function loadJoin(data) {
  document.getElementById('join-title').textContent = data.title;
  const grid = document.getElementById('join-grid');
  data.cards.forEach(cardData => {
    const card = document.createElement('div');
    card.className = 'join-card';
    card.innerHTML = `
            <div>
                <h3>${cardData.title}</h3>
                <p>${cardData.text}</p>
            </div>
            <a href="${cardData.buttonLink}" class="btn" style="margin-top: 1rem;">${cardData.buttonText}</a>
        `;
    grid.appendChild(card);
  });
}

function loadContact(data) {
  document.getElementById('contact-title').textContent = data.title;
  const form = document.getElementById('contact-form');
  const submitBtn = document.getElementById('contact-submit');
  submitBtn.textContent = data.submitText;

  // Insert fields before the submit button
  data.fields.forEach(field => {
    const div = document.createElement('div');
    div.className = 'form-group';

    const label = document.createElement('label');
    label.htmlFor = field.id;
    label.textContent = field.label;

    let input;
    if (field.type === 'textarea') {
      input = document.createElement('textarea');
    } else {
      input = document.createElement('input');
      input.type = field.type;
    }
    input.id = field.id;
    input.name = field.id;
    if (field.required !== false) {
      input.required = true;
    }

    div.appendChild(label);
    div.appendChild(input);

    form.insertBefore(div, submitBtn);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    const formData = {};
    new FormData(form).forEach((value, key) => {
      formData[key] = value;
    });

    try {
      const response = await fetch('https://hyqyauuqfadburdbysnp.supabase.co/functions/v1/submit-form', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5cXlhdXVxZmFkYnVyZGJ5c25wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5ODM0NTAsImV4cCI6MjA3OTU1OTQ1MH0.R51I6obHbh24VNmV9gc-Uh449ozmPPPLA3wJfDsk6b4'
        },
        body: JSON.stringify({
          formType: 'Contact Form',
          ...formData
        })
      });

      const result = await response.json();

      if (result.success) {
        alert('Message sent successfully!');
        form.reset();
      } else {
        alert(`Failed to send message: ${result.message}`);
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      alert('An error occurred. Please try again later.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = data.submitText;
    }
  });
}

function loadFooter(data) {
  document.getElementById('footer-copyright').textContent = data.copyright;
}
