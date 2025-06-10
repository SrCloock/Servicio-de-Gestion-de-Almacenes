document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const nombre = params.get('nombre');
  document.getElementById('nombreCliente').value = nombre || '';
});
