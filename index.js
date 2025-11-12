'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const themeToggle = document.querySelector('.theme-toggle');
  const themeIcon = document.querySelector('.theme-icon');
  const infoCards = document.querySelectorAll('.info-card');
  const modal = document.getElementById('card-modal');
  const modalTitle = document.getElementById('modal-title');
  const modalSubtitle = document.getElementById('modal-subtitle');
  const modalBody = document.getElementById('modal-body');
  const modalTags = document.querySelector('.modal-tags');
  const modalClose = document.querySelector('.modal-close');
  const body = document.body;
  const heroTitle = document.querySelector('.hero-title');
  const heroEmojis = document.querySelectorAll('.hero-emoji');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const yearEl = document.getElementById('year');
  const weatherWidget = document.getElementById('weather-widget');

  let lastFocusedElement = null;
  let typingTimeout;

  const setTheme = (mode) => {
    body.dataset.theme = mode;
    if (themeIcon) {
      themeIcon.textContent = mode === 'dark' ? '☼' : '☾';
    }
  };

  setTheme('light');

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const nextTheme = body.dataset.theme === 'light' ? 'dark' : 'light';
      setTheme(nextTheme);
    });
  }

  const openModal = (card) => {
    if (!modal || !modalTitle || !modalSubtitle || !modalBody || !modalTags || !modalClose) return;

    lastFocusedElement = card;
    modalTitle.textContent = card.dataset.title || '';
    modalSubtitle.textContent = card.dataset.subtitle || '';
    const description = card.dataset.description || '';
    modalBody.innerHTML = description.replace(/\n\s*/g, '<br />');

    modalTags.innerHTML = '';
    const tags = card.dataset.tags ? card.dataset.tags.split(',') : [];
    tags.forEach((tag) => {
      const li = document.createElement('li');
      li.textContent = tag.trim();
      modalTags.appendChild(li);
    });

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    body.style.overflow = 'hidden';
    modalClose.focus();
  };

  const closeModal = () => {
    if (!modal || !modalClose) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    body.style.overflow = '';
    if (lastFocusedElement) {
      lastFocusedElement.focus();
    }
  };

  infoCards.forEach((card) => {
    card.addEventListener('click', () => openModal(card));
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openModal(card);
      }
    });
  });

  if (modalClose && modal) {
    modalClose.addEventListener('click', closeModal);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        closeModal();
      }
    });

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && modal.classList.contains('open')) {
        closeModal();
      }
    });
  }

  const runTypewriter = () => {
    if (!heroTitle) return;
    const fullText = heroTitle.dataset.text || heroTitle.textContent.trim();
    clearTimeout(typingTimeout);

    if (reduceMotion.matches) {
      heroTitle.textContent = fullText;
      heroTitle.dataset.typing = 'false';
      return;
    }

    heroTitle.dataset.typing = 'true';
    heroTitle.textContent = '';
    let index = 0;

    const typeChar = () => {
      if (index <= fullText.length) {
        heroTitle.textContent = fullText.slice(0, index);
        index += 1;
        typingTimeout = setTimeout(typeChar, 75);
      } else {
        heroTitle.dataset.typing = 'false';
      }
    };

    typeChar();
  };

  runTypewriter();
  reduceMotion.addEventListener('change', runTypewriter);

  const heroEmojiOptions = ['💻', '🔐', '🛡️', '🧑‍💻', '⚙️', '📡', '🛰️', '🕹️', '🧠', '📱'];

  const seedHeroEmojis = () => {
    if (!heroEmojis.length) return;
    const pool = [...heroEmojiOptions];

    const pickEmoji = () => {
      if (!pool.length) pool.push(...heroEmojiOptions);
      const index = Math.floor(Math.random() * pool.length);
      return pool.splice(index, 1)[0];
    };

    heroEmojis.forEach((el, index) => {
      el.textContent = pickEmoji();
      if (index === 0) {
        el.style.left = '16%';
        el.style.top = '19%';
      } else {
        el.style.right = '12%';
        el.style.bottom = '28%';
      }
    });
  };

  seedHeroEmojis();

  const formatTime = (isoString) => {
    if (!isoString) return '--';
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const fetchWeather = async () => {
    if (!weatherWidget) return;
    const endpoint =
      'https://api.open-meteo.com/v1/forecast?latitude=25.7587&longitude=-80.3984&current_weather=true&hourly=relative_humidity_2m&daily=sunrise,sunset&timezone=auto';
    weatherWidget.textContent = 'Miami weather loading…';

    try {
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();

      const currentTempC = data.current_weather?.temperature;
      const wind = data.current_weather?.windspeed;
      const humidity = Array.isArray(data.hourly?.relative_humidity_2m)
        ? data.hourly.relative_humidity_2m[0]
        : null;

      const tempText =
        typeof currentTempC === 'number'
          ? `${Math.round((currentTempC * 9) / 5 + 32)}°F`
          : '—';

      weatherWidget.innerHTML = `
        <span class="weather-city">Miami</span>
        <span class="weather-temp">${tempText}</span>
        <span class="weather-meta">
          ${typeof humidity === 'number' ? `Humidity ${humidity}%` : ''}
          ${typeof wind === 'number' ? `• Wind ${Math.round(wind)} mph` : ''}
        </span>
      `;
    } catch (error) {
      console.error('Weather fetch failed:', error);
      weatherWidget.textContent = 'Miami weather unavailable';
    }
  };

  fetchWeather();

  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }
});
