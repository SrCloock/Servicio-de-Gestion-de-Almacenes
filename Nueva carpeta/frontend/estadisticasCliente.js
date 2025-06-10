document.addEventListener('DOMContentLoaded', () => {
  const tabs = document.querySelectorAll('.tab');
  const contents = document.querySelectorAll('.tab-content');

  // ✅ Manejo de pestañas
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
    });
  });

  // ✅ Botón volver
  document.querySelector('.volver').addEventListener('click', () => {
    window.history.back(); // o location.href = 'fichaCliente.html';
  });

  // ✅ Obtener el CIF de la URL y rellenar las celdas
  const params = new URLSearchParams(window.location.search);
  const cif = params.get('cif');

  if (cif) {
    document.querySelectorAll('.cif-cliente').forEach(cell => {
      cell.textContent = cif;
    });
  }
});
