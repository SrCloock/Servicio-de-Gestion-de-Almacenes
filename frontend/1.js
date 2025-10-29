// migrate-api.js
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Para obtener __dirname en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Rutas CORREGIDAS - según tu estructura real
const filesToUpdate = [
  'src/pages/AlbaranesAsignadosScreen.jsx',
  'src/pages/AsignarPedidosScreen.jsx',
  'src/pages/DesignarRutasScreen.jsx',
  'src/pages/DetalleAlbaran.jsx',
  'src/pages/FirmaScreen.jsx',
  'src/pages/GestionDocumentalScreen.jsx',
  'src/pages/GestionRutas.jsx',
  'src/pages/InventarioPage.jsx',
  'src/pages/LoginPage.jsx',
  'src/pages/PedidosScreen.jsx',
  'src/pages/TraspasosPage.jsx'
];

console.log('🚀 Iniciando migración de API...\n');
console.log('Directorio actual:', __dirname);
console.log('');

let updatedCount = 0;
let notFoundCount = 0;

filesToUpdate.forEach(filePath => {
  const fullPath = join(__dirname, filePath);
  
  if (existsSync(fullPath)) {
    let content = readFileSync(fullPath, 'utf8');
    let changes = false;
    
    console.log(`📁 Procesando: ${filePath}`);
    
    // 1. Reemplazar import de axios
    if (content.includes("import axios from 'axios';")) {
      content = content.replace("import axios from 'axios';", "import API from '../helpers/api';");
      changes = true;
      console.log('   ✅ Reemplazado import de axios');
    }
    
    // 2. Reemplazar llamadas axios
    const axiosCallCount = (content.match(/axios\.(get|post|put|delete|patch)/g) || []).length;
    if (axiosCallCount > 0) {
      content = content.replace(/axios\.(get|post|put|delete|patch)/g, 'API.$1');
      changes = true;
      console.log(`   ✅ Reemplazadas ${axiosCallCount} llamadas axios`);
    }
    
    // 3. Eliminar URLs de localhost
    const localhostCount = (content.match(/http:\/\/localhost:3000\//g) || []).length;
    if (localhostCount > 0) {
      content = content.replace(/http:\/\/localhost:3000\//g, '/');
      changes = true;
      console.log(`   ✅ Eliminadas ${localhostCount} URLs de localhost`);
    }
    
    // 4. Eliminar headers manuales (opcional - el interceptor los maneja)
    const headerPattern1 = /,\s*{\s*headers\s*:\s*getAuthHeader\(\)\s*}\s*/g;
    const headerPattern2 = /{\s*headers\s*:\s*getAuthHeader\(\)\s*}/g;
    
    const headerCount1 = (content.match(headerPattern1) || []).length;
    const headerCount2 = (content.match(headerPattern2) || []).length;
    
    if (headerCount1 > 0 || headerCount2 > 0) {
      content = content.replace(headerPattern1, '');
      content = content.replace(headerPattern2, '{}');
      changes = true;
      console.log(`   ✅ Eliminados ${headerCount1 + headerCount2} headers manuales`);
    }
    
    if (changes) {
      writeFileSync(fullPath, content, 'utf8');
      console.log(`   🎉 ARCHIVO ACTUALIZADO: ${filePath}`);
      updatedCount++;
    } else {
      console.log(`   ℹ️  Sin cambios necesarios: ${filePath}`);
    }
    
  } else {
    console.log(`❌ NO ENCONTRADO: ${filePath}`);
    notFoundCount++;
  }
  
  console.log(''); // Línea en blanco entre archivos
});

console.log('='.repeat(60));
console.log('📊 RESUMEN FINAL DE MIGRACIÓN:');
console.log(`✅ Archivos actualizados: ${updatedCount}`);
console.log(`❌ Archivos no encontrados: ${notFoundCount}`);
console.log(`📁 Total procesados: ${filesToUpdate.length}`);
console.log('='.repeat(60));

if (updatedCount > 0) {
  console.log('\n🎉 ¡Migración completada con éxito!');
  console.log('\n📝 PRÓXIMOS PASOS:');
  console.log('1. Verifica que los cambios sean correctos');
  console.log('2. Crea el archivo src/helpers/api.js si no existe');
  console.log('3. Ejecuta: npm run dev');
  console.log('4. Prueba que todo funcione correctamente');
} else {
  console.log('\n⚠️  No se realizaron cambios. Revisa las rutas de archivos.');
}