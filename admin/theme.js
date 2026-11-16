/* The studio follows the desk lamp on the public page: the same saved choice, the same default (lamp off, slate night). */
(function () {
  var root = document.documentElement;
  try { var saved = localStorage.getItem('theme'); if (saved === 'light' || saved === 'dark') root.setAttribute('data-theme', saved); } catch (e) {}
  document.addEventListener('DOMContentLoaded', function () {
    var lamp = document.getElementById('lamp'), state = document.getElementById('lampState');
    if (!lamp) return;
    function render() {
      var lit = root.getAttribute('data-theme') === 'light';
      lamp.setAttribute('aria-checked', String(lit));
      state.textContent = lit ? 'On' : 'Off';
    }
    lamp.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      render();
    });
    render();
  });
})();
