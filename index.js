const express = require("express");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const prisma = new PrismaClient();
const PORT = 3000;

// Clave secreta para JWT (en producción, usar variable de entorno)
const JWT_SECRET = "tu_clave_secreta_muy_segura_cambiala_en_produccion";

app.use(express.json());

// CORS middleware para desarrollo (permite requests desde Expo/web)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// ==================== RUTAS DE AUTENTICACIÓN ====================

// Registro de usuario
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, id_role } = req.body;

    // Validar campos requeridos
    if (!name || !email || !password) {
      return res.status(400).json({ 
        message: "Nombre, email y contraseña son requeridos" 
      });
    }

    // Validar id_role (debe ser 1 o 2)
    if (id_role && id_role !== 1 && id_role !== 2) {
      return res.status(400).json({ 
        message: "El rol debe ser 1 (Cliente) o 2 (Vendedor)" 
      });
    }

    // Verificar si el usuario ya existe
    const usuarioExistente = await prisma.user.findUnique({
      where: { email }
    });

    if (usuarioExistente) {
      return res.status(400).json({ 
        message: "El email ya está registrado" 
      });
    }

    // Hashear la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear usuario con rol (id_role por defecto es 1 si no se proporciona)
    const rolId = id_role || 1; // Cliente por defecto
    const usuario = await prisma.user.create({
      data: {
        username: name,
        email: email,
        password: hashedPassword,
        rolId: rolId
      },
      include: {
        rol: true
      }
    });

    // Si es cliente (rol 1), crear registro en tabla Client
    if (rolId === 1) {
      await prisma.client.create({
        data: {
          userId: usuario.id,
          points: 0
        }
      });
    }

    // Si es vendedor (rol 2), crear registro en tabla Company
    if (rolId === 2) {
      await prisma.company.create({
        data: {
          userId: usuario.id
        }
      });
    }

    // Generar token JWT
    const token = jwt.sign(
      { userId: usuario.id, email: usuario.email, role: usuario.rolId },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      message: "Usuario registrado exitosamente",
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.username,
        email: usuario.email,
        role: usuario.rolId,
        rolNombre: usuario.rol.name
      }
    });

  } catch (error) {
    console.error("Error en registro:", error);
    res.status(500).json({ 
      message: "Error al registrar usuario",
      error: error.message 
    });
  }
});

// Login de usuario
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validar campos requeridos
    if (!email || !password) {
      return res.status(400).json({ 
        message: "Email y contraseña son requeridos" 
      });
    }

    // Buscar usuario por email
    const usuario = await prisma.user.findUnique({
      where: { email },
      include: {
        rol: true
      }
    });

    if (!usuario) {
      return res.status(401).json({ 
        message: "Credenciales incorrectas" 
      });
    }

    // Verificar contraseña
    const passwordValida = await bcrypt.compare(password, usuario.password);

    if (!passwordValida) {
      return res.status(401).json({ 
        message: "Credenciales incorrectas" 
      });
    }

    // Generar token JWT
    const token = jwt.sign(
      { userId: usuario.id, email: usuario.email, role: usuario.rolId },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login exitoso",
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.username,
        email: usuario.email,
        role: usuario.rolId,
        rolNombre: usuario.rol.name
      }
    });

  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ 
      message: "Error al iniciar sesión",
      error: error.message 
    });
  }
});

// Middleware para verificar token JWT
const verificarToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ message: "Token no proporcionado" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Token inválido o expirado" });
  }
};

// Ruta protegida - Obtener perfil del usuario
app.get("/api/auth/perfil", verificarToken, async (req, res) => {
  try {
    const usuario = await prisma.user.findUnique({
      where: { id: req.userId },
      include: {
        rol: true
      },
      select: {
        id: true,
        username: true,
        email: true,
        rolId: true,
        rol: {
          select: {
            name: true
          }
        }
      }
    });

    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.json({
      id: usuario.id,
      nombre: usuario.username,
      email: usuario.email,
      role: usuario.rolId,
      rolNombre: usuario.rol.name
    });

  } catch (error) {
    console.error("Error al obtener perfil:", error);
    res.status(500).json({ 
      message: "Error al obtener perfil",
      error: error.message 
    });
  }
});

// ==================== RUTAS ORIGINALES ====================


// Registrar usuario 
app.post("/register", async (req, res) => {
  const user = await prisma.user.create({
    data: { username: req.body.username, 
            email: req.body.email, 
            password: req.body.password, 
            profile_picture: req.body.profile_picture },
  });
  res.json(user);
});

// Crear producto
app.post("/productos", async (req, res) => {
  const product = await prisma.product.create({
    data: {
      Barcode: req.body.Barcode,
      product_name: req.body.product_name,
      price: req.body.price,
    },
  });
  res.json(product);
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
