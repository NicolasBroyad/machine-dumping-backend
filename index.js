const express = require("express");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const prisma = new PrismaClient();

// Configuración desde variables de entorno o valores por defecto
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Clave secreta para JWT (en producción, usar variable de entorno)
const JWT_SECRET = process.env.JWT_SECRET || "tu_clave_secreta_muy_segura_cambiala_en_produccion";

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

    // Determinar tipo según rol
    const tipo = rolId === 2 ? 'compania' : 'cliente';

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
        rolNombre: usuario.rol.name,
        tipo: tipo
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
        rol: true,
        client: true,
        company: true
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

    // Determinar tipo según relaciones
    let tipo = 'cliente';
    if (usuario.company) {
      tipo = 'compania';
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
        rolNombre: usuario.rol.name,
        tipo: tipo
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
        rol: true,
        client: true,
        company: true
      }
    });

    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    // Determinar tipo según relaciones
    let tipo = 'cliente';
    if (usuario.company) {
      tipo = 'compania';
    }

    res.json({
      id: usuario.id,
      nombre: usuario.username,
      email: usuario.email,
      role: usuario.rolId,
      rolNombre: usuario.rol.name,
      tipo: tipo,
      // Info adicional según tipo
      ...(usuario.client && { puntos: usuario.client.points }),
      ...(usuario.company && { esCompania: true })
    });

  } catch (error) {
    console.error("Error al obtener perfil:", error);
    res.status(500).json({ 
      message: "Error al obtener perfil",
      error: error.message 
    });
  }
});

// Crear un environment (solo para usuarios con company asociado)
app.post('/api/environments', verificarToken, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'El nombre del entorno es requerido' });
    }

    // Buscar la company relacionada al usuario autenticado
    const company = await prisma.company.findUnique({ where: { userId: req.userId } });

    if (!company) {
      return res.status(400).json({ message: 'El usuario no pertenece a una company' });
    }

    const environment = await prisma.environment.create({
      data: {
        name,
        companyId: company.id,
      },
    });

    res.status(201).json(environment);
  } catch (error) {
    console.error('Error creando environment:', error);
    res.status(500).json({ message: 'Error al crear environment', error: error.message });
  }
});

// Obtener environments del company del usuario autenticado
app.get('/api/environments/mine', verificarToken, async (req, res) => {
  try {
    const company = await prisma.company.findUnique({
      where: { userId: req.userId },
      include: { environments: true },
    });

    if (!company) {
      return res.status(404).json({ message: 'Company no encontrada para el usuario' });
    }

    res.json(company.environments);
  } catch (error) {
    console.error('Error obteniendo environments:', error);
    res.status(500).json({ message: 'Error al obtener environments', error: error.message });
  }
});

// Crear un producto en un environment
app.post('/api/products', verificarToken, async (req, res) => {
  try {
    const { name, price, barcode, environmentId } = req.body;

    if (!name || !price || !barcode || !environmentId) {
      return res.status(400).json({ message: 'Todos los campos son requeridos (name, price, barcode, environmentId)' });
    }

    // Verificar que el environment existe y pertenece a la company del usuario
    const company = await prisma.company.findUnique({
      where: { userId: req.userId },
      include: { environments: true },
    });

    if (!company) {
      return res.status(400).json({ message: 'El usuario no pertenece a una company' });
    }

    const envBelongsToCompany = company.environments.some(env => env.id === environmentId);
    if (!envBelongsToCompany) {
      return res.status(403).json({ message: 'El environment no pertenece a tu company' });
    }

    // Verificar si ya existe un producto con ese barcode en este environment
    const existingProduct = await prisma.product.findFirst({
      where: { barcode, environmentId },
    });

    if (existingProduct) {
      return res.status(400).json({ message: 'Ya existe un producto con ese código de barras en este entorno' });
    }

    const product = await prisma.product.create({
      data: {
        name,
        price: parseFloat(price),
        barcode,
        environmentId,
      },
    });

    res.status(201).json(product);
  } catch (error) {
    console.error('Error creando producto:', error);
    res.status(500).json({ message: 'Error al crear producto', error: error.message });
  }
});

// Obtener productos de un environment
app.get('/api/products/:environmentId', verificarToken, async (req, res) => {
  try {
    const environmentId = parseInt(req.params.environmentId);

    // Verificar que el environment pertenece a la company del usuario
    const company = await prisma.company.findUnique({
      where: { userId: req.userId },
      include: { environments: true },
    });

    if (!company) {
      return res.status(400).json({ message: 'El usuario no pertenece a una company' });
    }

    const envBelongsToCompany = company.environments.some(env => env.id === environmentId);
    if (!envBelongsToCompany) {
      return res.status(403).json({ message: 'El environment no pertenece a tu company' });
    }

    const products = await prisma.product.findMany({
      where: { environmentId },
    });

    res.json(products);
  } catch (error) {
    console.error('Error obteniendo productos:', error);
    res.status(500).json({ message: 'Error al obtener productos', error: error.message });
  }
});

// Editar un producto
app.put('/api/products/:id', verificarToken, async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const { name, price } = req.body;

    if (!name || !price) {
      return res.status(400).json({ message: 'Nombre y precio son requeridos' });
    }

    // Buscar el producto
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { environment: true },
    });

    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    // Verificar que el producto pertenece a la company del usuario
    const company = await prisma.company.findUnique({
      where: { userId: req.userId },
      include: { environments: true },
    });

    if (!company) {
      return res.status(400).json({ message: 'El usuario no pertenece a una company' });
    }

    const envBelongsToCompany = company.environments.some(env => env.id === product.environmentId);
    if (!envBelongsToCompany) {
      return res.status(403).json({ message: 'No tienes permiso para editar este producto' });
    }

    // Actualizar el producto
    const updatedProduct = await prisma.product.update({
      where: { id: productId },
      data: {
        name,
        price: parseFloat(price),
      },
    });

    res.json(updatedProduct);
  } catch (error) {
    console.error('Error editando producto:', error);
    res.status(500).json({ message: 'Error al editar producto', error: error.message });
  }
});

// Eliminar un producto
app.delete('/api/products/:id', verificarToken, async (req, res) => {
  try {
    const productId = parseInt(req.params.id);

    // Buscar el producto
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { environment: true },
    });

    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    // Verificar que el producto pertenece a la company del usuario
    const company = await prisma.company.findUnique({
      where: { userId: req.userId },
      include: { environments: true },
    });

    if (!company) {
      return res.status(400).json({ message: 'El usuario no pertenece a una company' });
    }

    const envBelongsToCompany = company.environments.some(env => env.id === product.environmentId);
    if (!envBelongsToCompany) {
      return res.status(403).json({ message: 'No tienes permiso para eliminar este producto' });
    }

    // Eliminar el producto
    await prisma.product.delete({
      where: { id: productId },
    });

    res.json({ message: 'Producto eliminado exitosamente' });
  } catch (error) {
    console.error('Error eliminando producto:', error);
    res.status(500).json({ message: 'Error al eliminar producto', error: error.message });
  }
});

// ==================== RUTAS PARA CLIENTES ====================

// Obtener todos los environments disponibles (para que los clientes puedan unirse)
app.get('/api/environments/all', verificarToken, async (req, res) => {
  try {
    const environments = await prisma.environment.findMany({
      include: {
        company: {
          include: {
            user: {
              select: {
                username: true,
              }
            }
          }
        }
      }
    });

    // Formatear respuesta con nombre de la company
    const formattedEnvironments = environments.map(env => ({
      id: env.id,
      name: env.name,
      companyName: env.company.user.username,
    }));

    res.json(formattedEnvironments);
  } catch (error) {
    console.error('Error obteniendo todos los environments:', error);
    res.status(500).json({ message: 'Error al obtener environments', error: error.message });
  }
});

// Unirse a un environment (solo para clientes)
app.post('/api/environments/join', verificarToken, async (req, res) => {
  try {
    const { environmentId } = req.body;

    if (!environmentId) {
      return res.status(400).json({ message: 'El environmentId es requerido' });
    }

    // Buscar el client relacionado al usuario autenticado
    const client = await prisma.client.findUnique({ 
      where: { userId: req.userId } 
    });

    if (!client) {
      return res.status(400).json({ message: 'El usuario no es un cliente' });
    }

    // Verificar que el environment existe
    const environment = await prisma.environment.findUnique({
      where: { id: environmentId },
    });

    if (!environment) {
      return res.status(404).json({ message: 'El entorno no existe' });
    }

    // Actualizar el client con el environmentId
    const updatedClient = await prisma.client.update({
      where: { id: client.id },
      data: { environmentId },
      include: {
        environment: true,
      }
    });

    res.json({
      message: 'Te has unido al entorno exitosamente',
      environment: updatedClient.environment,
    });
  } catch (error) {
    console.error('Error uniéndose al environment:', error);
    res.status(500).json({ message: 'Error al unirse al entorno', error: error.message });
  }
});

// Obtener el environment al que está unido el cliente
app.get('/api/environments/joined', verificarToken, async (req, res) => {
  try {
    const client = await prisma.client.findUnique({
      where: { userId: req.userId },
      include: {
        environment: true,
      },
    });

    if (!client) {
      return res.status(400).json({ message: 'El usuario no es un cliente' });
    }

    if (!client.environment) {
      return res.json({ environment: null });
    }

    res.json({ environment: client.environment });
  } catch (error) {
    console.error('Error obteniendo environment del cliente:', error);
    res.status(500).json({ message: 'Error al obtener environment', error: error.message });
  }
});

// Buscar producto por código de barras en el entorno del cliente
app.get('/api/products/scan/:barcode', verificarToken, async (req, res) => {
  try {
    const { barcode } = req.params;

    // Buscar el cliente y su entorno
    const client = await prisma.client.findUnique({
      where: { userId: req.userId },
      include: {
        environment: true,
      },
    });

    if (!client) {
      return res.status(400).json({ message: 'El usuario no es un cliente' });
    }

    if (!client.environmentId) {
      return res.status(400).json({ message: 'No estás unido a ningún entorno' });
    }

    // Buscar el producto por código de barras en el entorno del cliente
    const product = await prisma.product.findFirst({
      where: {
        barcode,
        environmentId: client.environmentId,
      },
    });

    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado en este entorno' });
    }

    res.json(product);
  } catch (error) {
    console.error('Error buscando producto por código de barras:', error);
    res.status(500).json({ message: 'Error al buscar producto', error: error.message });
  }
});

// Registrar una compra (crear un registro)
app.post('/api/registers', verificarToken, async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ message: 'El productId es requerido' });
    }

    // Buscar el cliente
    const client = await prisma.client.findUnique({
      where: { userId: req.userId },
      include: {
        environment: true,
      },
    });

    if (!client) {
      return res.status(400).json({ message: 'El usuario no es un cliente' });
    }

    if (!client.environmentId) {
      return res.status(400).json({ message: 'No estás unido a ningún entorno' });
    }

    // Verificar que el producto existe y pertenece al entorno del cliente
    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        environmentId: client.environmentId,
      },
    });

    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado en tu entorno' });
    }

    // Obtener el companyId del entorno
    const environment = await prisma.environment.findUnique({
      where: { id: client.environmentId },
    });

    // Crear el registro
    const register = await prisma.register.create({
      data: {
        productId: product.id,
        environmentId: client.environmentId,
        clientId: client.id,
        companyId: environment.companyId,
      },
      include: {
        product: true,
      },
    });

    res.status(201).json({
      message: 'Compra registrada exitosamente',
      register,
    });
  } catch (error) {
    console.error('Error registrando compra:', error);
    res.status(500).json({ message: 'Error al registrar compra', error: error.message });
  }
});

// Obtener todos los registros de compras del cliente
app.get('/api/registers/mine', verificarToken, async (req, res) => {
  try {
    // Buscar el cliente
    const client = await prisma.client.findUnique({
      where: { userId: req.userId },
    });

    if (!client) {
      return res.status(400).json({ message: 'El usuario no es un cliente' });
    }

    // Obtener todos los registros del cliente
    const registers = await prisma.register.findMany({
      where: {
        clientId: client.id,
      },
      include: {
        product: true,
        environment: true,
      },
      orderBy: {
        datetime: 'desc',
      },
    });

    res.json(registers);
  } catch (error) {
    console.error('Error obteniendo registros:', error);
    res.status(500).json({ message: 'Error al obtener registros', error: error.message });
  }
});

// Obtener todos los registros de compras del entorno de la company
app.get('/api/registers/company', verificarToken, async (req, res) => {
  try {
    // Buscar la company
    const company = await prisma.company.findUnique({
      where: { userId: req.userId },
      include: {
        environments: true,
      },
    });

    if (!company) {
      return res.status(400).json({ message: 'El usuario no es una compañía' });
    }

    if (company.environments.length === 0) {
      return res.json([]);
    }

    // Obtener todos los registros del entorno de la company
    const registers = await prisma.register.findMany({
      where: {
        companyId: company.id,
      },
      include: {
        product: true,
        environment: true,
        client: {
          include: {
            user: {
              select: {
                username: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: {
        datetime: 'desc',
      },
    });

    res.json(registers);
  } catch (error) {
    console.error('Error obteniendo registros de la company:', error);
    res.status(500).json({ message: 'Error al obtener registros', error: error.message });
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

app.listen(PORT, HOST, () => {
  console.log(`Servidor corriendo en http://${HOST}:${PORT}`);
  console.log(`Accesible desde tu red local en http://192.168.0.44:${PORT}`);
  console.log(`Para cambiar la IP, establece la variable de entorno HOST`);
});
