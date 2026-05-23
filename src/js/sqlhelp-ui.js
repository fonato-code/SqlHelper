(function (global) {
  'use strict';
  var SqlHelp = global.SqlHelp = global.SqlHelp || {};

  SqlHelp.themeMixin = {
    methods: {
      applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
      },
      toggleTheme() {
        this.theme = this.theme === 'dark' ? 'light' : 'dark';
        this.applyTheme(this.theme);
        localStorage.setItem('sqlhelp-theme', this.theme);
      }
    },
    mounted() {
      this.applyTheme(this.theme);
    }
  };

  SqlHelp.readClipboardText = async function readClipboardText() {
    return navigator.clipboard.readText();
  };

  SqlHelp.clipboardErrorMessage = function clipboardErrorMessage(e, fallback) {
    if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
      return 'Não foi possível ler a área de transferência. Permita o acesso ou cole o texto no campo acima.';
    }
    return e.message || fallback || 'Erro ao ler a área de transferência.';
  };

  SqlHelp.showToast = function showToast(vm, msg) {
    vm.toastMessage = msg;
    const el = vm.$refs.toastEl;
    if (el && global.bootstrap) {
      global.bootstrap.Toast.getOrCreateInstance(el).show();
    }
  };
})(typeof window !== 'undefined' ? window : this);
