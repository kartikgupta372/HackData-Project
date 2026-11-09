const multer = require('multer');
const path   = require('path');

// Files are held in memory and then written through services/storage, so they
// land in Supabase Storage in production instead of the container's disk.
const ALLOWED = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
  'application/pdf': ['.pdf'],
  'text/plain': ['.txt'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED[file.mimetype]?.includes(ext)) cb(null, true);
  else cb(new Error(`File type not allowed (${ext || file.mimetype}). Use images, PDF, TXT, or DOCX.`), false);
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
});

module.exports = upload;
