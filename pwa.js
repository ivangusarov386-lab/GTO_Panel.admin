'use strict';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(error => {
    console.warn('Не удалось зарегистрировать приложение ГТО.', error);
  });
}

const installButton = document.getElementById('installApp');
if (installButton) {
  let installPrompt;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    installButton.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    installButton.hidden = true;
  });
  installButton.addEventListener('click', async () => {
    if (!installPrompt) return;
    const prompt = installPrompt;
    installPrompt = null;
    installButton.hidden = true;
    try {
      await prompt.prompt();
    } catch (error) {
      console.warn('Не удалось открыть окно установки ГТО.', error);
    }
  });
}
