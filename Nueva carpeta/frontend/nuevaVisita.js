document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const nombre = params.get('nombre');
  document.getElementById('nombreCliente').value = nombre || '';

  // Rellenar horas (00 a 23) y minutos (00 a 59)
  const selectsHoras = [document.getElementById('horaInicial'), document.getElementById('horaFinal')];
  const selectsMinutos = [document.getElementById('minutoInicial'), document.getElementById('minutoFinal')];

  for (let h = 0; h < 24; h++) {
    const texto = h.toString().padStart(2, '0');
    selectsHoras.forEach(select => {
      select.appendChild(new Option(texto, texto));
    });
  }

  for (let m = 0; m < 60; m++) {
    const texto = m.toString().padStart(2, '0');
    selectsMinutos.forEach(select => {
      select.appendChild(new Option(texto, texto));
    });
  }

  // Poner la fecha de hoy
  const fechaInput = document.getElementById('fecha');
  const hoy = new Date().toISOString().split('T')[0];
  fechaInput.value = hoy;
});

function finalizarVisita() {
  alert('Visita finalizada correctamente.');
  window.history.back();
}
