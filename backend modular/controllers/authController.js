// Archivo generado automáticamente: authController.js
const { getPool, sql } = require('../config/db');
const { CATEGORIAS_PERMISOS } = require('../config/constants');

const login = async (req, res) => {
  const { usuario, contrasena } = req.body;

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('usuario', sql.VarChar, usuario)
      .input('contrasena', sql.VarChar, contrasena)
      .query(`
        SELECT 
          c.*,
          ce.CodigoCategoriaEmpleadoLc AS categoria
        FROM Clientes c
        LEFT JOIN LcCategoriasEmpleado ce 
          ON ce.CodigoEmpresa = c.CodigoEmpresa
          AND ce.CodigoCategoriaEmpleadoLc = c.CodigoCategoriaEmpleadoLc
        WHERE c.UsuarioLogicNet = @usuario 
          AND c.ContraseñaLogicNet = @contrasena
      `);

    if (result.recordset.length > 0) {
      const userData = result.recordset[0];
      const permisos = CATEGORIAS_PERMISOS[userData.categoria] || CATEGORIAS_PERMISOS.USUARIO;
      
      res.json({ 
        success: true, 
        mensaje: 'Login correcto', 
        datos: userData,
        permisos 
      });
    } else {
      res.status(401).json({ success: false, mensaje: 'Usuario o contraseña incorrectos' });
    }
  } catch (err) {
    console.error('[ERROR SQL LOGIN]', err);
    res.status(500).json({ success: false, mensaje: 'Error de conexión a la base de datos' });
  }
};

const getCategoriasEmpleado = async (req, res) => {
  const { codigoEmpresa } = req.query;

  if (!codigoEmpresa) {
    return res.status(400).json({ success: false, mensaje: 'Código de empresa requerido.' });
  }

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('CodigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT CodigoCategoriaEmpleadoLc AS codigo, CategoriaEmpleadoLc AS nombre
        FROM LcCategoriasEmpleado
        WHERE CodigoEmpresa = @CodigoEmpresa
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR CATEGORIAS EMPLEADO]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener categorías de empleado.' });
  }
};

module.exports = {
  login,
  getCategoriasEmpleado
};