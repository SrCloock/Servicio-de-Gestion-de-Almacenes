const path = require('path');
const dotenv = require('dotenv');
const sql = require('mssql');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const dbConfig = {
  user: process.env.SAGE200_USER,
  password: process.env.SAGE200_PASSWORD,
  server: process.env.SAGE200_SERVER,
  database: process.env.SAGE200_DATABASE,
  options: {
    trustServerCertificate: true,
    useUTC: false,
    dateStrings: true,
    enableArithAbort: true,
    requestTimeout: 60000,
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  }
};

let poolGlobal;

function validateDbConfig() {
  const requiredEnvVars = [
    'SAGE200_USER',
    'SAGE200_PASSWORD',
    'SAGE200_SERVER',
    'SAGE200_DATABASE'
  ];

  const missingVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

  if (missingVars.length > 0) {
    throw new Error(`Faltan variables de entorno de BD: ${missingVars.join(', ')}`);
  }
}

async function connectDB() {
  try {
    validateDbConfig();

    if (!poolGlobal) {
      poolGlobal = await sql.connect(dbConfig);
      console.log('Conexion a SQL Server establecida.');
    }

    return poolGlobal;
  } catch (err) {
    console.error('Error de conexion a BD:', err);
    throw err;
  }
}

function getPool() {
  return poolGlobal;
}

async function closeDB() {
  if (poolGlobal) {
    await poolGlobal.close();
    poolGlobal = null;
  }
}

module.exports = {
  sql,
  dbConfig,
  connectDB,
  getPool,
  closeDB
};
