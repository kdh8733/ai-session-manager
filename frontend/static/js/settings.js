/**
 * settings.js — Settings panel
 */

const Settings = (() => {
  const cfgProjectDirs = document.getElementById('cfg-project-dirs');
  const cfgClaudeBin   = document.getElementById('cfg-claude-bin');
  const cfgClaudeDir   = document.getElementById('cfg-claude-dir');
  const cfgSave        = document.getElementById('cfg-save');
  const fontUpload     = document.getElementById('font-upload');
  const btnUploadFont  = document.getElementById('btn-upload-font');
  const fontList       = document.getElementById('font-list');

  async function load() {
    const cfg = await API.get('/api/settings/');
    cfgProjectDirs.value = (cfg.project_dirs || []).join('\n');
    cfgClaudeBin.value   = cfg.claude_bin || 'claude';
    cfgClaudeDir.value   = cfg.claude_dir || '';
    _loadFonts();
  }

  // Browse button for settings
  document.getElementById('cfg-browse-dir')?.addEventListener('click', () => {
    App._openBrowsePopup || window._openBrowsePopup;
    const w = 650, h = 500;
    const left = (screen.width - w) / 2;
    const top = (screen.height - h) / 2;
    const saved = window._onDirSelected;
    window._onDirSelected = function(path) {
      const cur = cfgProjectDirs.value.trim();
      cfgProjectDirs.value = cur ? cur + '\n' + path : path;
      window._onDirSelected = saved;
    };
    window.open('/browse', 'dir-browser', `width=${w},height=${h},left=${left},top=${top},resizable=yes`);
  });

  // Browse button for onboarding
  document.getElementById('ob-browse')?.addEventListener('click', () => {
    const obDirs = document.getElementById('ob-project-dirs');
    const w = 650, h = 500;
    const left = (screen.width - w) / 2;
    const top = (screen.height - h) / 2;
    const saved = window._onDirSelected;
    window._onDirSelected = function(path) {
      const cur = obDirs.value.trim();
      obDirs.value = cur ? cur + '\n' + path : path;
      window._onDirSelected = saved;
    };
    window.open('/browse', 'dir-browser', `width=${w},height=${h},left=${left},top=${top},resizable=yes`);
  });

  cfgSave.addEventListener('click', async () => {
    const project_dirs = cfgProjectDirs.value
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

    await API.put('/api/settings/', {
      project_dirs,
      claude_bin: cfgClaudeBin.value.trim(),
      claude_dir: cfgClaudeDir.value.trim(),
    });

    cfgSave.textContent = '저장됨 ✓';
    setTimeout(() => { cfgSave.textContent = '저장'; }, 2000);
    State.emit('settingsChanged');
  });

  btnUploadFont.addEventListener('click', async () => {
    const file = fontUpload.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    await fetch('/api/settings/fonts', { method: 'POST', body: fd });
    fontUpload.value = '';
    _loadFonts();
  });

  async function _loadFonts() {
    const fonts = await API.get('/api/settings/fonts');
    fontList.innerHTML = fonts.map(f => `<li>${f}</li>`).join('');
  }

  // Onboarding
  const onboarding = document.getElementById('onboarding');
  const obSave     = document.getElementById('ob-save');

  obSave.addEventListener('click', async () => {
    const project_dirs = document.getElementById('ob-project-dirs').value
      .split('\n').map(s => s.trim()).filter(Boolean);
    const claude_bin   = document.getElementById('ob-claude-bin').value.trim();

    await API.put('/api/settings/', { project_dirs, claude_bin });
    onboarding.classList.add('hidden');
    App.init();
  });

  function showOnboarding() {
    onboarding.classList.remove('hidden');
  }

  return { load, showOnboarding };
})();
