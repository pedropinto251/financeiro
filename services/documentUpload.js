const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');

async function normalizeUploadedDocument(file) {
  const meta = {
    originalName: file.originalname,
    filePath: file.filename,
    mimeType: file.mimetype,
    fileSize: file.size,
  };

  if (!file.mimetype || !file.mimetype.startsWith('image/')) {
    return meta;
  }

  const uploadsDir = path.join(__dirname, '..', 'private_uploads');
  const absolutePath = path.join(uploadsDir, file.filename);
  const baseName = path.basename(file.filename, path.extname(file.filename));
  const pdfName = `${baseName}.pdf`;
  const pdfPath = path.join(uploadsDir, pdfName);

  try {
    let imageBytes = await fs.promises.readFile(absolutePath);
    let imageType = file.mimetype;

    if (imageType !== 'image/png' && imageType !== 'image/jpeg') {
      imageBytes = await sharp(imageBytes).png().toBuffer();
      imageType = 'image/png';
    }

    const pdf = await PDFDocument.create();
    const image = imageType === 'image/png'
      ? await pdf.embedPng(imageBytes)
      : await pdf.embedJpg(imageBytes);
    const page = pdf.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    const pdfBytes = await pdf.save();
    await fs.promises.writeFile(pdfPath, pdfBytes);
    await fs.promises.unlink(absolutePath).catch(() => {});
    const stat = await fs.promises.stat(pdfPath);
    return {
      originalName: file.originalname.replace(/\.[^.]+$/, '') + '.pdf',
      filePath: pdfName,
      mimeType: 'application/pdf',
      fileSize: stat.size,
    };
  } catch (err) {
    console.error('document:convert-to-pdf failed', err);
    return meta;
  }
}

module.exports = { normalizeUploadedDocument };
