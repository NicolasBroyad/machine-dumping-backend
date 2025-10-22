const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Limpia tablas existentes
  await prisma.escaneo.deleteMany();
  await prisma.producto.deleteMany();
  await prisma.usuario.deleteMany();

  // Datos exactos del frontend (10 personas con sus gastos)
  const personasData = [
    { nombre: "Matute", dineroGastado: 200 },
    { nombre: "Nico", dineroGastado: 150 },
    { nombre: "Santi", dineroGastado: 100 },
    { nombre: "Juani", dineroGastado: 80 },
    { nombre: "Lucho", dineroGastado: 50 },
    { nombre: "Ana", dineroGastado: 30 },
    { nombre: "Carlos", dineroGastado: 20 },
    { nombre: "Laura", dineroGastado: 10 },
    { nombre: "Diego", dineroGastado: 5 },
    { nombre: "Marta", dineroGastado: 2 },
  ];

  // Crear usuarios
  const usuarios = [];
  for (const p of personasData) {
    const u = await prisma.usuario.create({
      data: {
        nombre: p.nombre,
        email: `${p.nombre.toLowerCase()}@example.com`,
      }
    });
    usuarios.push({ ...u, targetGasto: p.dineroGastado });
  }

  // Crear productos genéricos para simular compras
  const productos = [];
  const productosData = [
    { codigoBarra: '0001', nombre: 'Producto A', precio: 10 },
    { codigoBarra: '0002', nombre: 'Producto B', precio: 5 },
    { codigoBarra: '0003', nombre: 'Producto C', precio: 1 },
  ];

  for (const p of productosData) {
    const prod = await prisma.producto.create({ data: p });
    productos.push(prod);
  }

  // Crear escaneos para que cada usuario tenga el gasto exacto
  for (const user of usuarios) {
    let gastoActual = 0;
    const targetGasto = user.targetGasto;

    // Distribuir el gasto usando productos disponibles
    while (gastoActual < targetGasto) {
      const restante = targetGasto - gastoActual;
      let productoIndex;
      
      if (restante >= 10) {
        productoIndex = 0; // Producto A (10)
      } else if (restante >= 5) {
        productoIndex = 1; // Producto B (5)
      } else {
        productoIndex = 2; // Producto C (1)
      }

      await prisma.escaneo.create({
        data: {
          usuarioId: user.id,
          productoId: productos[productoIndex].id,
        }
      });

      gastoActual += productos[productoIndex].precio;
    }
  }

  console.log('✅ Seeding finished! Created:', {
    usuarios: usuarios.length,
    productos: productos.length,
  });
}

main()
  .catch(e => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
