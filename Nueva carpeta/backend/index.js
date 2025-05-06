const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.get('/clientes', (req, res) => {
  res.json([
    { codigo: "1041", cliente: "LOPICOMO, S.L." },
    { codigo: "1111", cliente: "NUEVA REPOSTERIA" }
  ]);
});

app.listen(PORT, () => {
  console.log(`Servidor backend corriendo en http://localhost:${PORT}`);
});
