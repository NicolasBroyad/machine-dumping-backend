const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  await prisma.rol.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: 'client' }
  })

  await prisma.rol.upsert({
    where: { id: 2 },
    update: {},
    create: { id: 2, name: 'company' }
  })
}

main()
  .then(() => {
    console.log("✔ Seed ejecutada correctamente.")
  })
  .catch((e) => {
    console.error("❌ Error en seed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
