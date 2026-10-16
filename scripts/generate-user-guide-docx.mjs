import fs from 'node:fs';
import path from 'node:path';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle } from 'docx';

const root = process.cwd();
const input = path.join(root, 'docs', 'USER_GUIDE.md');
const output = path.join(root, 'docs', 'Bin-Ishaq-HR-Payroll-User-Guide.docx');
const lines = fs.readFileSync(input, 'utf8').split(/\r?\n/);
const children = [];

const runs = text => {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map(part => {
    if (part.startsWith('**') && part.endsWith('**')) return new TextRun({ text: part.slice(2, -2), bold: true });
    if (part.startsWith('`') && part.endsWith('`')) return new TextRun({ text: part.slice(1, -1), font: 'Consolas', color: '147A56' });
    return new TextRun(part.replace(/  $/, ''));
  });
};

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim() || line.trim() === '---') continue;
  if (line.startsWith('```')) {
    const code = [];
    while (++i < lines.length && !lines[i].startsWith('```')) code.push(lines[i]);
    children.push(new Paragraph({ children: [new TextRun({ text: code.join('\n'), font: 'Consolas', size: 18 })], spacing: { before: 120, after: 120 }, shading: { fill: 'EEF3DF' } }));
    continue;
  }
  if (line.startsWith('|') && lines[i + 1]?.match(/^\|[-|: ]+\|$/)) {
    const rows = [];
    const parse = value => value.slice(1, -1).split('|').map(cell => cell.trim());
    rows.push(parse(line)); i += 2;
    while (i < lines.length && lines[i].startsWith('|')) { rows.push(parse(lines[i])); i++; }
    i--;
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: rows.map((row, ri) => new TableRow({ children: row.map(cell => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: cell.replace(/\*\*/g, ''), bold: ri === 0, size: 18 })] })], shading: ri === 0 ? { fill: 'E7EEE9' } : undefined })) })), borders: { top:{style:BorderStyle.SINGLE,size:1,color:'C7D1CB'},bottom:{style:BorderStyle.SINGLE,size:1,color:'C7D1CB'},left:{style:BorderStyle.SINGLE,size:1,color:'C7D1CB'},right:{style:BorderStyle.SINGLE,size:1,color:'C7D1CB'},insideHorizontal:{style:BorderStyle.SINGLE,size:1,color:'DDE4DF'},insideVertical:{style:BorderStyle.SINGLE,size:1,color:'DDE4DF'} } }));
    continue;
  }
  const heading = line.match(/^(#{1,4})\s+(.+)$/);
  if (heading) {
    const levels = [HeadingLevel.TITLE, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];
    children.push(new Paragraph({ text: heading[2], heading: levels[heading[1].length - 1], pageBreakBefore: heading[1].length === 2 && children.length > 3 }));
    continue;
  }
  const bullet = line.match(/^[-*]\s+(.+)$/);
  const numbered = line.match(/^\d+\.\s+(.+)$/);
  if (bullet) { children.push(new Paragraph({ children: runs(bullet[1]), bullet: { level: 0 }, spacing: { after: 60 } })); continue; }
  if (numbered) { children.push(new Paragraph({ children: runs(numbered[1]), numbering: { reference: 'guide-numbering', level: 0 }, spacing: { after: 60 } })); continue; }
  children.push(new Paragraph({ children: runs(line), spacing: { after: 110, line: 280 } }));
}

const document = new Document({
  styles: { default: { document: { run: { font: 'Arial', size: 21, color: '10241E' }, paragraph: { spacing: { line: 280 } } } }, paragraphStyles: [
    { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { font: 'Arial', size: 42, bold: true, color: '10241E' }, paragraph: { alignment: AlignmentType.CENTER, spacing: { after: 260 } } },
    { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', run: { font: 'Arial', size: 30, bold: true, color: '147A56' }, paragraph: { spacing: { before: 220, after: 100 } } },
    { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', run: { font: 'Arial', size: 25, bold: true, color: '10241E' }, paragraph: { spacing: { before: 180, after: 90 } } },
    { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', run: { font: 'Arial', size: 22, bold: true, color: '275D78' }, paragraph: { spacing: { before: 140, after: 70 } } }
  ] },
  numbering: { config: [{ reference: 'guide-numbering', levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }] },
  sections: [{ properties: { page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } } }, children }]
});

fs.writeFileSync(output, await Packer.toBuffer(document));
console.log(`Created ${output}`);
