/**
 * ELECTRON VISION - File Compression Middleware
 * Provides server-side file compression to reduce storage by up to 80%
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const archiver = require('archiver');

// Compression level (1-9, where 9 is maximum compression)
const COMPRESSION_LEVEL = 9;

/**
 * Compress a file using gzip
 * @param {string} inputPath - Path to the input file
 * @param {string} outputPath - Path to save the compressed file
 * @returns {Promise<{success: boolean, originalSize: number, compressedSize: number, ratio: number}>}
 */
async function compressFileGzip(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const input = fs.createReadStream(inputPath);
    const output = fs.createWriteStream(outputPath);
    const gzip = zlib.createGzip({ level: COMPRESSION_LEVEL });

    input.pipe(gzip).pipe(output);

    output.on('finish', () => {
      const originalSize = fs.statSync(inputPath).size;
      const compressedSize = fs.statSync(outputPath).size;
      const ratio = ((originalSize - compressedSize) / originalSize * 100).toFixed(2);

      resolve({
        success: true,
        originalSize,
        compressedSize,
        ratio: parseFloat(ratio)
      });
    });

    output.on('error', reject);
    input.on('error', reject);
  });
}

/**
 * Compress multiple files into a ZIP archive
 * @param {string[]} filePaths - Array of file paths to compress
 * @param {string} outputPath - Path to save the ZIP file
 * @returns {Promise<{success: boolean, originalSize: number, compressedSize: number, ratio: number}>}
 */
async function compressFilesToZip(filePaths, outputPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: COMPRESSION_LEVEL }
    });

    let originalSize = 0;

    output.on('close', () => {
      const compressedSize = fs.statSync(outputPath).size;
      const ratio = ((originalSize - compressedSize) / originalSize * 100).toFixed(2);

      resolve({
        success: true,
        originalSize,
        compressedSize,
        ratio: parseFloat(ratio)
      });
    });

    archive.on('error', reject);

    archive.pipe(output);

    // Add each file to the archive
    for (const filePath of filePaths) {
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        originalSize += stat.size;
        archive.file(filePath, { name: path.basename(filePath) });
      }
    }

    archive.finalize();
  });
}

/**
 * Compress a directory into a ZIP archive
 * @param {string} dirPath - Path to the directory
 * @param {string} outputPath - Path to save the ZIP file
 * @returns {Promise<{success: boolean, originalSize: number, compressedSize: number, ratio: number}>}
 */
async function compressDirectory(dirPath, outputPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: COMPRESSION_LEVEL }
    });

    let originalSize = 0;

    output.on('close', () => {
      const compressedSize = fs.statSync(outputPath).size;
      const ratio = ((originalSize - compressedSize) / originalSize * 100).toFixed(2);

      resolve({
        success: true,
        originalSize,
        compressedSize,
        ratio: parseFloat(ratio)
      });
    });

    archive.on('error', reject);
    archive.on('entry', (entry) => {
      originalSize += entry.stats.size;
    });

    archive.pipe(output);
    archive.directory(dirPath, false);
    archive.finalize();
  });
}

/**
 * Decompress a gzip file
 * @param {string} inputPath - Path to the compressed file
 * @param {string} outputPath - Path to save the decompressed file
 * @returns {Promise<{success: boolean}>}
 */
async function decompressFile(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const input = fs.createReadStream(inputPath);
    const output = fs.createWriteStream(outputPath);
    const gunzip = zlib.createGunzip();

    input.pipe(gunzip).pipe(output);

    output.on('finish', () => {
      resolve({ success: true });
    });

    output.on('error', reject);
    input.on('error', reject);
  });
}

/**
 * Extract a ZIP file
 * @param {string} zipPath - Path to the ZIP file
 * @param {string} outputDir - Directory to extract to
 * @returns {Promise<{success: boolean, files: string[]}>}
 */
async function extractZip(zipPath, outputDir) {
  const extract = require('extract-zip');
  const files = [];

  try {
    await extract(zipPath, { dir: outputDir });
    
    // Get list of extracted files
    const readDir = (dir) => {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          readDir(fullPath);
        } else {
          files.push(fullPath);
        }
      }
    };
    readDir(outputDir);

    return { success: true, files };
  } catch (error) {
    throw error;
  }
}

/**
 * Get the compressed version of a file if it exists
 * @param {string} filePath - Original file path
 * @returns {string|null} - Path to compressed file or null
 */
function getCompressedPath(filePath) {
  const ext = path.extname(filePath);
  const dir = path.dirname(filePath);
  const name = path.basename(filePath, ext);
  const compressedPath = path.join(dir, `${name}.gz`);
  
  return fs.existsSync(compressedPath) ? compressedPath : null;
}

/**
 * Compress uploaded file automatically
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Object} multerFile - Multer file object
 * @returns {Promise<Object>} - Compression result
 */
async function compressUploadedFile(multerFile) {
  if (!multerFile || !multerFile.path) {
    return { success: false, error: 'No file provided' };
  }

  const originalPath = multerFile.path;
  const compressedPath = originalPath + '.gz';
  const originalSize = multerFile.size;

  try {
    const result = await compressFileGzip(originalPath, compressedPath);
    
    // Update file info with compressed version
    multerFile.compressed = true;
    multerFile.compressedPath = compressedPath;
    multerFile.compressionRatio = result.ratio;
    multerFile.compressedSize = result.compressedSize;

    console.log(`📦 File compressed: ${multerFile.originalname}`);
    console.log(`   Original: ${(originalSize / 1024).toFixed(2)} KB`);
    console.log(`   Compressed: ${(result.compressedSize / 1024).toFixed(2)} KB`);
    console.log(`   Ratio: ${result.ratio}%`);

    return result;
  } catch (error) {
    console.error('Compression error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Auto-compress all files in a directory
 * @param {string} dirPath - Directory path
 * @param {string[]} extensions - File extensions to compress (default: all)
 * @returns {Promise<Array>} - Array of compression results
 */
async function compressDirectoryFiles(dirPath, extensions = null) {
  const results = [];
  const files = fs.readdirSync(dirPath);

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);

    if (stat.isFile()) {
      const ext = path.extname(file).toLowerCase();
      
      // Skip if not matching extensions (if specified)
      if (extensions && !extensions.includes(ext)) {
        continue;
      }

      // Skip already compressed files
      if (ext === '.gz' || ext === '.zip') {
        continue;
      }

      const compressedPath = filePath + '.gz';
      
      // Skip if already compressed
      if (fs.existsSync(compressedPath)) {
        continue;
      }

      try {
        const result = await compressFileGzip(filePath, compressedPath);
        results.push({
          file: file,
          ...result
        });
      } catch (error) {
        results.push({
          file: file,
          success: false,
          error: error.message
        });
      }
    }
  }

  return results;
}

module.exports = {
  compressFileGzip,
  compressFilesToZip,
  compressDirectory,
  decompressFile,
  extractZip,
  getCompressedPath,
  compressUploadedFile,
  compressDirectoryFiles,
  COMPRESSION_LEVEL
};
