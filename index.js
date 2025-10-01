const express = require("express");
const { PrismaClient } = require("@prisma/client");

const app = express();
const prisma = new PrismaClient();
const PORT = 3000;

app.use(express.json());

// Crear usuario
app.post("/usuarios", async (req, res) => {
  const usuario = await prisma.usuario.create({
    data: { nombre: req.body.nombre, email: req.body.email },
  });
  res.json(usuario);
});

// Crear producto
app.post("/productos", async (req, res) => {
  const producto = await prisma.producto.create({
    data: {
      codigoBarra: req.body.codigoBarra,
      nombre: req.body.nombre,
      precio: req.body.precio,
    },
  });
  res.json(producto);
});

// Registrar escaneo
app.post("/escaneos", async (req, res) => {
  const escaneo = await prisma.escaneo.create({
    data: {
      usuarioId: req.body.usuarioId,
      productoId: req.body.productoId,
    },
  });
  res.json(escaneo);
});

// Ranking de usuarios por dinero gastado
app.get("/ranking", async (req, res) => {
  const usuarios = await prisma.usuario.findMany({
    include: {
      escaneos: { include: { producto: true } },
    },
  });

  // Calcular gasto total de cada usuario
  const ranking = usuarios.map(u => {
    const totalGastado = u.escaneos.reduce((acc, e) => acc + e.producto.precio, 0);
    return {
      nombre: u.nombre,
      email: u.email,
      totalGastado,
    };
  });

  // Ordenar por dinero gastado (descendente)
  ranking.sort((a, b) => b.totalGastado - a.totalGastado);

  res.json(ranking);
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
