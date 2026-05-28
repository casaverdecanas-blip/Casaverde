const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const client = new Anthropic();

function readProjectFiles() {
  const extensions = ['.html', '.js', '.css'];
  const ignore = ['node_modules', '.git', '.github'];
  let files = {};

  function walk(dir) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      if (ignore.includes(item)) continue;
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (extensions.includes(path.extname(item))) {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.length < 51200) {
          files[fullPath.replace('./', '')] = content;
        }
      }
    }
  }
  walk('.');
  return files;
}

async function main() {
  const issueTitle = process.env.ISSUE_TITLE;
  const issueBody = process.env.ISSUE_BODY || '';
  const issueNumber = process.env.ISSUE_NUMBER;

  console.log(`Processing Issue #${issueNumber}: ${issueTitle}`);

  const projectFiles = readProjectFiles();
  const filesContext = Object.entries(projectFiles)
    .map(([name, content]) => `=== ${name} ===\n${content}`)
    .join('\n\n');

  const prompt = `Sos el asistente de desarrollo de Casa Verde Canas, sistema de gestión de cabañas en Florianópolis, Brasil.

El proyecto usa Firebase Firestore, HTML5 + JS ES6+ sin frameworks, design-system.css y utils.js.

ARCHIVOS DEL PROYECTO:
${filesContext}

SOLICITUD (Issue #${issueNumber}):
Título: ${issueTitle}
Descripción: ${issueBody}

Respondé ÚNICAMENTE con un JSON válido, sin texto extra:
{
  "summary": "descripción breve de los cambios",
  "files": [
    {
      "path": "ruta/archivo.html",
      "content": "contenido completo del archivo modificado"
    }
  ]
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }]
  });

  const responseText = response.content[0].text;

  let result;
  try {
    result = JSON.parse(responseText);
  } catch (e) {
    const match = responseText.match(/\{[\s\S]*\}/);
    if (match) {
      result = JSON.parse(match[0]);
    } else {
      throw new Error('No se pudo extraer JSON de la respuesta');
    }
  }

  console.log('Summary:', result.summary);

  for (const file of result.files) {
    const dir = path.dirname(file.path);
    if (dir !== '.') fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file.path, file.content, 'utf8');
    console.log(`Written: ${file.path}`);
  }

  fs.writeFileSync('/tmp/edit_summary.txt', result.summary);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});