// Archivo generado automáticamente: db.js
const sql = require('mssql');

const dbConfig = {
  user: 'logic',
  password: 'Sage2024+',
  server: 'SVRALANDALUS',
  database: 'DEMOS',
  options: {
    trustServerCertificate: true,
    enableArithAbort: true,
    requestTimeout: 60000
  }
};

let poolGlobal;

async function conectarDB() {
  if (!poolGlobal) {
    poolGlobal = await sql.connect(dbConfig);
    console.log('✅ Conexión a SQL Server establecida.');
  }
  return poolGlobal;
}

module.exports = {
  conectarDB,
  getPool: () => poolGlobal,
  sql
};