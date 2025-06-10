let datos = [
  {codigo: "1041", cliente: "LOPICOMO, S.L.", domicilio: "CL/ILGUERILO, 4", municipio: "VILLAMARTIN", provincia: "CADIZ", cp: "11650", tlf: "678415381", fax: "", email: "info@quesospajarote.com", tipo: "FABRICA DE QUESOS"},
  {codigo: "1111", cliente: "NUEVA REPOSTERIA", domicilio: "CL/LAS ERAS, 15", municipio: "MONTALBAN", provincia: "CORDOBA", cp: "14548", tlf: "957310652", fax: "", email: "info@heladeriamontalban.com", tipo: "HELADERIAS"},
  // Agrega más registros aquí...
];

function cargarTabla() {
  const cuerpo = document.getElementById("cuerpoTabla");
  cuerpo.innerHTML = "";
  for (const c of datos) {
    const fila = `
      <tr>
        <td><button onclick="verCliente('${c.codigo}')">✔</button></td>
        <td>${c.codigo}</td>
        <td>${c.cliente}</td>
        <td>${c.domicilio}</td>
        <td>${c.municipio}</td>
        <td>${c.provincia}</td>
        <td>${c.cp}</td>
        <td>${c.tlf}</td>
        <td>${c.fax}</td>
        <td>${c.email}</td>
        <td>${c.tipo}</td>
      </tr>`;
    cuerpo.innerHTML += fila;
  }
}

function ordenarTabla(colIndex) {
  datos.sort((a, b) => {
    const valA = Object.values(a)[colIndex - 1].toString().toUpperCase();
    const valB = Object.values(b)[colIndex - 1].toString().toUpperCase();
    return valA.localeCompare(valB);
  });
  cargarTabla();
}

function filtrarClientes() {
  const nombre = document.getElementById("filtroNombre").value.toLowerCase();
  const campo = document.getElementById("tipoFiltro").value;
  const valor = document.getElementById("valorFiltro").value.toLowerCase();

const campoMap = {
  codigo: "codigo",
  cliente: "cliente",
  domicilio: "domicilio",
  municipio: "municipio",
  provincia: "provincia",
  cp: "cp",
  tlf: "tlf",
  fax: "fax",
  email: "email",
  tipo: "tipo"
};


  const campoFiltro = campoMap[campo];

  const filtrado = datos.filter(d => {
    const campoCliente = (d[campoFiltro] || "").toString().toLowerCase();
    const clienteNombre = d.cliente.toLowerCase();
    return clienteNombre.includes(nombre) && campoCliente.includes(valor);
  });

  mostrarTabla(filtrado);
}
function mostrarTabla(lista) {
  const cuerpo = document.getElementById("cuerpoTabla");
  cuerpo.innerHTML = "";
  for (const c of lista) {
    const fila = `
      <tr>
        <td><button onclick="verCliente('${c.codigo}')">✔</button></td>
        <td>${c.codigo}</td>
        <td>${c.cliente}</td>
        <td>${c.domicilio}</td>
        <td>${c.municipio}</td>
        <td>${c.provincia}</td>
        <td>${c.cp}</td>
        <td>${c.tlf}</td>
        <td>${c.fax}</td>
        <td>${c.email}</td>
        <td>${c.tipo}</td>
      </tr>`;
    cuerpo.innerHTML += fila;
  }
}
function cargarTabla() {
  mostrarTabla(datos);
}


function verCliente(codigo) {
    window.location.href = `fichaCliente.html?codigo=${codigo}`;
}


document.addEventListener("DOMContentLoaded", cargarTabla);
