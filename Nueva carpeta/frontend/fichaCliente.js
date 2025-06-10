// Datos simulados, deberían venir de una base real o API
const datosClientes = {
  "1041": {
    empresa: "EUROBAG & FILM, S.L.",
    nombre: "LOPICOMO, S.L.",
    codigo: "1041",
    cif: "A05017413",
    tipo: "Fábrica de Quesos",
    contacto: "Juan Pérez",
    pago: "Transferencia 30 días",
    email1: "info@lopicomo.com",
    email2: "facturas@lopicomo.com",
    telefono: "920312031",
    fax: "920252868",
    cp: "05004",
    domicilio: "PG/LAS HERVENCIAS, C/RIO ESLA N°50",
    municipio: "ÁVILA",
    provincia: "ÁVILA",
    comentarioCRM: "Muy buen cliente, contacto habitual cada 2 meses.",
    otrosComentarios: "Sede central en Ávila.",
    comentariosERP: "04/12/2020 --> CYC cobertura 20.000 €"
  },
  "1111": {
    empresa: "EUROBAG & FILM, S.L.",
    nombre: "NUEVA REPOSTERÍA, S.L.",
    codigo: "1111",
    cif: "B12345678",
    tipo: "HELADERÍAS",
    contacto: "María Gómez",
    pago: "Contado",
    email1: "info@heladeriamontalban.com",
    email2: "compras@nuevareposteria.com",
    telefono: "957310652",
    fax: "957000000",
    cp: "14548",
    domicilio: "CL/LAS ERAS, 15",
    municipio: "MONTALBÁN",
    provincia: "CÓRDOBA",
    comentarioCRM: "Cliente nuevo. Aumentar visitas.",
    otrosComentarios: "Requiere atención mensual.",
    comentariosERP: "Cliente sin incidencias actuales."
  }
};


function getClienteByCodigo(codigo) {
  return datosClientes[codigo];
}

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const codigo = params.get("codigo");
  const cliente = getClienteByCodigo(codigo);

  if (cliente) {
    for (const [key, value] of Object.entries(cliente)) {
      const input = document.getElementById(key);
      if (input) input.value = value;
    }
  } else {
    alert("Cliente no encontrado.");
  }
});

function abrirEstadisticas() {
  const cif = document.getElementById('cif').value;
  const url = `estadisticasCliente.html?cif=${encodeURIComponent(cif)}`;
  window.location.href = url;
}
function abrirNuevaVisita() {
  const nombre = document.getElementById('nombre').value;
  window.location.href = `nuevaVisita.html?nombre=${encodeURIComponent(nombre)}`;
}
function abrirNuevoPedido() {
  const nombre = document.getElementById('nombre').value;
  window.location.href = `nuevoPedido.html?nombre=${encodeURIComponent(nombre)}`;
}

