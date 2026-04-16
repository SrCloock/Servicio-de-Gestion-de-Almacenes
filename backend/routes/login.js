const express = require('express');

module.exports = function createloginRouter({ sql, getPool }) {
  const router = express.Router();

router.post('/login', async (req, res) => {
  const { usuario, contrasena } = req.body;

  try {
    const result = await getPool().request()
      .input('usuario', sql.VarChar, usuario)
      .input('contrasena', sql.VarChar, contrasena)
      .query(`
        SELECT * 
        FROM Clientes
        WHERE UsuarioLogicNet = @usuario 
          AND ContraseñaLogicNet = @contrasena
      `);

    if (result.recordset.length > 0) {
      const userData = result.recordset[0];
      res.json({ 
        success: true, 
        mensaje: 'Login correcto', 
        datos: userData
      });
    } else {
      res.status(401).json({ success: false, mensaje: 'Usuario o contraseña incorrectos' });
    }
  } catch (err) {
    console.error('[ERROR SQL LOGIN]', err);
    res.status(500).json({ success: false, mensaje: 'Error de conexión a la base de datos' });
  }
});


// ============================================
// ✅ 4. OBTENER EMPRESAS (DASHBOARD)


  return router;
};
