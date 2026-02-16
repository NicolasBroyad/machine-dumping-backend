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
          userId: usuario.id
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
        message: "Email/Usuario y contraseña son requeridos" 
      });
    }

    // Buscar usuario por email O username
    const usuario = await prisma.user.findFirst({
      where: {
        OR: [
          { email: email },
          { username: email } // Usamos el campo 'email' del body pero buscamos también por username
        ]
      },
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
      include: {
        company: {
          include: {
            user: {
              select: { username: true }
            }
          }
        }
      }
    });

    if (!environment) {
      return res.status(404).json({ message: 'El entorno no existe' });
    }

    // Verificar si ya está unido a este entorno
    const existingMembership = await prisma.clientEnvironment.findUnique({
      where: {
        clientId_environmentId: {
          clientId: client.id,
          environmentId: environmentId
        }
      }
    });

    if (existingMembership) {
      return res.status(400).json({ message: 'Ya estás unido a este entorno' });
    }

    // Crear la membresía en la tabla intermedia
    const membership = await prisma.clientEnvironment.create({
      data: {
        clientId: client.id,
        environmentId: environmentId,
        points: 0
      },
      include: {
        environment: {
          include: {
            company: {
              include: {
                user: {
                  select: { username: true }
                }
              }
            }
          }
        }
      }
    });

    res.json({
      message: 'Te has unido al entorno exitosamente',
      environment: {
        id: membership.environment.id,
        name: membership.environment.name,
        companyName: membership.environment.company.user.username,
        points: membership.points,
        joinedAt: membership.joinedAt
      },
    });
  } catch (error) {
    console.error('Error uniéndose al environment:', error);
    res.status(500).json({ message: 'Error al unirse al entorno', error: error.message });
  }
});

// Obtener todos los environments a los que está unido el cliente
app.get('/api/environments/joined', verificarToken, async (req, res) => {
  try {
    const client = await prisma.client.findUnique({
      where: { userId: req.userId },
      include: {
        memberships: {
          include: {
            environment: {
              include: {
                company: {
                  include: {
                    user: {
                      select: { username: true }
                    }
                  }
                }
              }
            }
          }
        }
      },
    });

    if (!client) {
      return res.status(400).json({ message: 'El usuario no es un cliente' });
    }

    // Formatear la respuesta
    const environments = client.memberships.map(m => ({
      id: m.environment.id,
      name: m.environment.name,
      companyName: m.environment.company.user.username,
      points: m.points,
      joinedAt: m.joinedAt
    }));

    res.json({ environments });
  } catch (error) {
    console.error('Error obteniendo environments del cliente:', error);
    res.status(500).json({ message: 'Error al obtener environments', error: error.message });
  }
});

// Salir de un environment (solo para clientes)
app.delete('/api/environments/leave/:environmentId', verificarToken, async (req, res) => {
  try {
    const environmentId = parseInt(req.params.environmentId);

    const client = await prisma.client.findUnique({
      where: { userId: req.userId }
    });

    if (!client) {
      return res.status(400).json({ message: 'El usuario no es un cliente' });
    }

    // Verificar si está unido a este entorno
    const membership = await prisma.clientEnvironment.findUnique({
      where: {
        clientId_environmentId: {
          clientId: client.id,
          environmentId: environmentId
        }
      }
    });

    if (!membership) {
      return res.status(400).json({ message: 'No estás unido a este entorno' });
    }

    // Eliminar la membresía
    await prisma.clientEnvironment.delete({
      where: {
        clientId_environmentId: {
          clientId: client.id,
          environmentId: environmentId
        }
      }
    });

    res.json({ message: 'Has salido del entorno exitosamente' });
  } catch (error) {
    console.error('Error saliendo del environment:', error);
    res.status(500).json({ message: 'Error al salir del entorno', error: error.message });
  }
});

// Buscar producto por código de barras en los entornos del cliente
app.get('/api/products/scan/:barcode', verificarToken, async (req, res) => {
  try {
    const { barcode } = req.params;
    const { environmentId } = req.query; // Opcional: especificar entorno

    // Buscar el cliente y sus membresías
    const client = await prisma.client.findUnique({
      where: { userId: req.userId },
      include: {
        memberships: {
          include: {
            environment: true
          }
        }
      },
    });

    if (!client) {
      return res.status(400).json({ message: 'El usuario no es un cliente' });
    }

    if (client.memberships.length === 0) {
      return res.status(400).json({ message: 'No estás unido a ningún entorno' });
    }

    // Si se especifica un environmentId, buscar solo en ese entorno
    if (environmentId) {
      const envId = parseInt(environmentId);
      const isMember = client.memberships.some(m => m.environmentId === envId);
      
      if (!isMember) {
        return res.status(403).json({ message: 'No estás unido a este entorno' });
      }

      const product = await prisma.product.findFirst({
        where: {
          barcode,
          environmentId: envId,
        },
        include: {
          environment: true
        }
      });

      if (!product) {
        return res.status(404).json({ message: 'Producto no encontrado en este entorno' });
      }

      return res.json(product);
    }

    // Si no se especifica, buscar en todos los entornos del cliente
    const environmentIds = client.memberships.map(m => m.environmentId);
    
    const products = await prisma.product.findMany({
      where: {
        barcode,
        environmentId: { in: environmentIds },
      },
      include: {
        environment: true
      }
    });

    if (products.length === 0) {
      return res.status(404).json({ message: 'Producto no encontrado en tus entornos' });
    }

    // Si hay solo un producto, devolverlo directamente
    if (products.length === 1) {
      return res.json(products[0]);
    }

    // Si hay múltiples productos (mismo barcode en diferentes entornos), devolver todos
    res.json({
      multiple: true,
      products: products.map(p => ({
        ...p,
        environmentName: p.environment.name
      }))
    });
  } catch (error) {
    console.error('Error buscando producto por código de barras:', error);
    res.status(500).json({ message: 'Error al buscar producto', error: error.message });
  }
});

// Registrar una compra (crear un registro)
app.post('/api/registers', verificarToken, async (req, res) => {
  try {
    const { productId, environmentId } = req.body;

    if (!productId) {
      return res.status(400).json({ message: 'El productId es requerido' });
    }

    if (!environmentId) {
      return res.status(400).json({ message: 'El environmentId es requerido' });
    }

    // Buscar el cliente y sus membresías
    const client = await prisma.client.findUnique({
      where: { userId: req.userId },
      include: {
        memberships: true
      },
    });

    if (!client) {
      return res.status(400).json({ message: 'El usuario no es un cliente' });
    }

    // Verificar que el cliente está unido al entorno
    const membership = client.memberships.find(m => m.environmentId === environmentId);
    if (!membership) {
      return res.status(403).json({ message: 'No estás unido a este entorno' });
    }

    // Verificar que el producto existe y pertenece al entorno
    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        environmentId: environmentId,
      },
    });

    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado en este entorno' });
    }

    // Obtener el companyId del entorno
    const environment = await prisma.environment.findUnique({
      where: { id: environmentId },
    });

    // Crear el registro con el precio histórico
    const register = await prisma.register.create({
      data: {
        productId: product.id,
        environmentId: environmentId,
        clientId: client.id,
        companyId: environment.companyId,
        price: product.price, // Guardar el precio al momento de la compra
      },
      include: {
        product: true,
        environment: true,
      },
    });

    // Actualizar puntos del cliente en este entorno (ejemplo: 1 punto por compra)
    await prisma.clientEnvironment.update({
      where: {
        clientId_environmentId: {
          clientId: client.id,
          environmentId: environmentId
        }
      },
      data: {
        points: { increment: 1 }
      }
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
    const { environmentId } = req.query; // Opcional: filtrar por entorno específico

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

    // Construir filtro: si se especifica environmentId, filtrar por ese entorno
    const whereClause = {
      companyId: company.id,
    };

    if (environmentId) {
      // Verificar que el entorno pertenece a esta company
      const envBelongsToCompany = company.environments.some(env => env.id === parseInt(environmentId));
      if (!envBelongsToCompany) {
        return res.status(403).json({ message: 'No tienes acceso a este entorno' });
      }
      whereClause.environmentId = parseInt(environmentId);
    }

    // Obtener todos los registros del entorno de la company
    const registers = await prisma.register.findMany({
      where: whereClause,
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

// Obtener estadísticas del entorno de la company
app.get('/api/statistics/company', verificarToken, async (req, res) => {
  try {
    const { environmentId: requestedEnvId } = req.query; // Opcional: estadísticas de un entorno específico

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
      return res.json({
        totalRecaudado: 0,
        cantidadVendidos: 0,
        productoMasComprado: null,
        mayorComprador: null,
      });
    }

    // Si se especifica un entorno, usarlo; sino, usar el primero
    let environmentId;
    if (requestedEnvId) {
      // Verificar que el entorno pertenece a esta company
      const envBelongsToCompany = company.environments.some(env => env.id === parseInt(requestedEnvId));
      if (!envBelongsToCompany) {
        return res.status(403).json({ message: 'No tienes acceso a este entorno' });
      }
      environmentId = parseInt(requestedEnvId);
    } else {
      environmentId = company.environments[0].id;
    }

    // Obtener todos los registros del entorno
    const registers = await prisma.register.findMany({
      where: { environmentId },
      include: {
        product: true,
        client: {
          include: {
            user: {
              select: {
                username: true,
              },
            },
          },
        },
      },
    });

    // Calcular total recaudado y cantidad vendidos
    const totalRecaudado = registers.reduce((sum, reg) => sum + reg.price, 0);
    const cantidadVendidos = registers.length;

    // Calcular producto más comprado
    const productoCount = {};
    registers.forEach(reg => {
      const productId = reg.productId;
      if (!productoCount[productId]) {
        productoCount[productId] = {
          count: 0,
          name: reg.product.name,
          price: reg.price,
        };
      }
      productoCount[productId].count++;
    });

    let productoMasComprado = null;
    let maxCount = 0;
    for (const [productId, data] of Object.entries(productoCount)) {
      if (data.count > maxCount) {
        maxCount = data.count;
        productoMasComprado = {
          name: data.name,
          count: data.count,
          price: data.price,
        };
      }
    }

    // Calcular mayor comprador
    const clienteGastos = {};
    registers.forEach(reg => {
      const clientId = reg.clientId;
      if (!clienteGastos[clientId]) {
        clienteGastos[clientId] = {
          total: 0,
          username: reg.client.user.username,
          compras: 0,
        };
      }
      clienteGastos[clientId].total += reg.price;
      clienteGastos[clientId].compras++;
    });

    let mayorComprador = null;
    let maxGasto = 0;
    for (const [clientId, data] of Object.entries(clienteGastos)) {
      if (data.total > maxGasto) {
        maxGasto = data.total;
        mayorComprador = {
          username: data.username,
          total: data.total,
          compras: data.compras,
        };
      }
    }

    res.json({
      totalRecaudado,
      cantidadVendidos,
      productoMasComprado,
      mayorComprador,
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ message: 'Error al obtener estadísticas', error: error.message });
  }
});

// Obtener estadísticas del cliente (por entorno o general)
app.get('/api/statistics/client', verificarToken, async (req, res) => {
  try {
    const { environmentId } = req.query; // Opcional: estadísticas de un entorno específico

    const client = await prisma.client.findUnique({
      where: { userId: req.userId },
      include: {
        memberships: {
          include: {
            environment: true
          }
        }
      },
    });

    if (!client) {
      return res.status(400).json({ message: 'El usuario no es un cliente' });
    }

    if (client.memberships.length === 0) {
      return res.json({
        productoFavorito: null,
        rankingPosicion: null,
        entornos: []
      });
    }

    // Si se especifica un entorno, calcular estadísticas solo para ese entorno
    if (environmentId) {
      const envId = parseInt(environmentId);
      const membership = client.memberships.find(m => m.environmentId === envId);
      
      if (!membership) {
        return res.status(403).json({ message: 'No estás unido a este entorno' });
      }

      // Obtener registros del cliente en este entorno
      const myRegisters = await prisma.register.findMany({
        where: { 
          clientId: client.id,
          environmentId: envId
        },
        include: { product: true },
      });

      // Calcular producto favorito
      const productoCount = {};
      myRegisters.forEach(reg => {
        const productId = reg.productId;
        if (!productoCount[productId]) {
          productoCount[productId] = { count: 0, name: reg.product.name, price: reg.price };
        }
        productoCount[productId].count++;
      });

      let productoFavorito = null;
      let maxCount = 0;
      for (const [productId, data] of Object.entries(productoCount)) {
        if (data.count > maxCount) {
          maxCount = data.count;
          productoFavorito = { name: data.name, count: data.count, price: data.price };
        }
      }

      // Calcular ranking en el entorno
      const allRegisters = await prisma.register.findMany({
        where: { environmentId: envId },
        include: {
          product: true,
          client: { include: { user: { select: { username: true } } } },
        },
      });

      const clienteGastos = {};
      allRegisters.forEach(reg => {
        const cId = reg.clientId;
        if (!clienteGastos[cId]) {
          clienteGastos[cId] = { total: 0, username: reg.client.user.username };
        }
        clienteGastos[cId].total += reg.price;
      });

      const ranking = Object.entries(clienteGastos)
        .map(([cId, data]) => ({ clientId: parseInt(cId), username: data.username, total: data.total }))
        .sort((a, b) => b.total - a.total);

      let rankingPosicion = null;
      const posicion = ranking.findIndex(r => r.clientId === client.id);
      if (posicion !== -1) {
        rankingPosicion = {
          posicion: posicion + 1,
          totalParticipantes: ranking.length,
          total: ranking[posicion].total,
        };
      }

      return res.json({
        environmentId: envId,
        environmentName: membership.environment.name,
        points: membership.points,
        productoFavorito,
        rankingPosicion,
      });
    }

    // Si no se especifica entorno, devolver resumen de todos los entornos
    const entornosStats = await Promise.all(client.memberships.map(async (membership) => {
      const envId = membership.environmentId;
      
      const myRegisters = await prisma.register.findMany({
        where: { clientId: client.id, environmentId: envId },
        include: { product: true },
      });

      const totalGastado = myRegisters.reduce((sum, reg) => sum + reg.price, 0);
      const cantidadCompras = myRegisters.length;

      return {
        environmentId: envId,
        environmentName: membership.environment.name,
        points: membership.points,
        totalGastado,
        cantidadCompras,
        joinedAt: membership.joinedAt
      };
    }));

    res.json({
      entornos: entornosStats,
      totalEntornos: entornosStats.length
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas del cliente:', error);
    res.status(500).json({ message: 'Error al obtener estadísticas', error: error.message });
  }
});

// Obtener ranking completo de un entorno
app.get('/api/statistics/ranking/:environmentId', verificarToken, async (req, res) => {
  try {
    const environmentId = parseInt(req.params.environmentId);

    // Verificar que el entorno existe
    const environment = await prisma.environment.findUnique({
      where: { id: environmentId },
      include: { company: { include: { user: { select: { username: true } } } } }
    });

    if (!environment) {
      return res.status(404).json({ message: 'Entorno no encontrado' });
    }

    // Obtener todos los registros del entorno
    const allRegisters = await prisma.register.findMany({
      where: { environmentId },
      include: {
        client: { include: { user: { select: { username: true } } } },
      },
    });

    // Calcular gastos por cliente
    const clienteGastos = {};
    allRegisters.forEach(reg => {
      const cId = reg.clientId;
      if (!clienteGastos[cId]) {
        clienteGastos[cId] = { 
          total: 0, 
          username: reg.client.user.username,
          compras: 0
        };
      }
      clienteGastos[cId].total += reg.price;
      clienteGastos[cId].compras++;
    });

    // Crear ranking ordenado
    const ranking = Object.entries(clienteGastos)
      .map(([cId, data], index) => ({ 
        clientId: parseInt(cId), 
        username: data.username, 
        total: data.total,
        compras: data.compras
      }))
      .sort((a, b) => b.total - a.total)
      .map((item, index) => ({ ...item, posicion: index + 1 }));

    res.json({
      environmentId,
      environmentName: environment.name,
      companyName: environment.company.user.username,
      totalParticipantes: ranking.length,
      ranking
    });
  } catch (error) {
    console.error('Error obteniendo ranking:', error);
    res.status(500).json({ message: 'Error al obtener ranking', error: error.message });
  }
});

// Obtener ranking de productos favoritos del cliente en un entorno
app.get('/api/statistics/productos-favoritos/:environmentId', verificarToken, async (req, res) => {
  try {
    const environmentId = parseInt(req.params.environmentId);

    // Buscar el cliente
    const client = await prisma.client.findUnique({
      where: { userId: req.userId },
      include: {
        memberships: {
          where: { environmentId },
          include: { environment: true }
        }
      }
    });

    if (!client) {
      return res.status(400).json({ message: 'El usuario no es un cliente' });
    }

    // Verificar que está unido al entorno
    if (client.memberships.length === 0) {
      return res.status(403).json({ message: 'No estás unido a este entorno' });
    }

    const membership = client.memberships[0];

    // Obtener todos los registros del cliente en este entorno
    const myRegisters = await prisma.register.findMany({
      where: {
        clientId: client.id,
        environmentId
      },
      include: { product: true },
      orderBy: { datetime: 'desc' }
    });

    // Agrupar por producto y calcular estadísticas
    const productosStats = {};
    myRegisters.forEach(reg => {
      const productId = reg.productId;
      if (!productosStats[productId]) {
        productosStats[productId] = {
          productId,
          name: reg.product.name,
          count: 0,
          totalGastado: 0,
          precioUnitario: reg.price, // Usar el último precio pagado
          primeraCompra: reg.datetime,
          ultimaCompra: reg.datetime
        };
      }
      productosStats[productId].count++;
      productosStats[productId].totalGastado += reg.price;
      
      // Actualizar fechas
      if (new Date(reg.datetime) < new Date(productosStats[productId].primeraCompra)) {
        productosStats[productId].primeraCompra = reg.datetime;
      }
      if (new Date(reg.datetime) > new Date(productosStats[productId].ultimaCompra)) {
        productosStats[productId].ultimaCompra = reg.datetime;
      }
    });

    // Crear ranking ordenado por cantidad de compras
    const ranking = Object.values(productosStats)
      .sort((a, b) => b.count - a.count)
      .map((item, index) => ({
        ...item,
        posicion: index + 1
      }));

    // Calcular totales
    const totalProductosDistintos = ranking.length;
    const totalCompras = myRegisters.length;
    const totalGastado = myRegisters.reduce((sum, reg) => sum + reg.price, 0);

    res.json({
      environmentId,
      environmentName: membership.environment.name,
      totalProductosDistintos,
      totalCompras,
      totalGastado,
      productosFavoritos: ranking
    });
  } catch (error) {
    console.error('Error obteniendo productos favoritos:', error);
    res.status(500).json({ message: 'Error al obtener productos favoritos', error: error.message });
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
