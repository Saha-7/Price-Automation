import Product from '../models/Product.js';
import UploadLog from '../models/UploadLog.js';
import mssqlApiService from '../services/mssqlApiService.js';

/**
 * Sync Controller
 * Handles data synchronization from MS-SQL APIs
 */

/**
 * Sync products from MS-SQL APIs (Zoho + Shopify SKUs)
 */
export const syncFromMSSQL = async (req, res) => {
  try {
    console.log('🔄 Starting MS-SQL API sync...');
    
    // Create upload log
    const uploadId = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const uploadLog = await UploadLog.create({
      uploadId: uploadId,
      uploadType: 'api_sync',
      userId: req.user._id,
      userName: req.user.name,
      fileName: 'MS-SQL API Sync',
      uploadedAt: new Date()
    });

    // Fetch combined data from both APIs
    const combinedData = await mssqlApiService.fetchCombinedData();
    
    uploadLog.totalRows = combinedData.length;
    
    let successCount = 0;
    let failedCount = 0;

    // Process each product
    for (const productData of combinedData) {
      try {
        if (!productData.sku) {
          uploadLog.addError(null, 'UNKNOWN', 'Missing SKU');
          continue;
        }

        // Find or create product
        let product = await Product.findOne({ sku: productData.sku });

        if (product) {
          // Update existing product
          const oldPrice = product.currentSellingPrice;
          
          product.productName = productData.productName || product.productName;
          product.productType = productData.productType || product.productType;
          product.brand = productData.brand || product.brand;
          product.mrp = productData.mrp || product.mrp;
          product.purchasePrice = productData.purchasePrice || product.purchasePrice;
          
          // Update price if changed
          if (productData.currentSellingPrice && productData.currentSellingPrice !== oldPrice) {
            product.addPriceHistory(
              productData.currentSellingPrice,
              'api_sync',
              req.user._id,
              req.user.name,
              uploadId
            );
          }
          
          product.dataSource = 'api_sync';
          await product.save();
          
        } else {
          // Create new product
          product = await Product.create({
            ...productData,
            dataSource: 'api_sync',
            priceHistory: productData.currentSellingPrice ? [{
              price: productData.currentSellingPrice,
              oldPrice: null,
              updatedAt: new Date(),
              source: 'api_sync',
              uploadId: uploadId,
              userId: req.user._id,
              userName: req.user.name
            }] : []
          });
        }

        successCount++;
        uploadLog.successfulRows++;
        
      } catch (error) {
        console.error(`Error processing SKU ${productData.sku}:`, error.message);
        uploadLog.addError(null, productData.sku, error.message);
        failedCount++;
      }
    }

    uploadLog.processedRows = successCount + failedCount;
    uploadLog.markCompleted();
    await uploadLog.save();

    res.json({
      success: true,
      message: 'MS-SQL sync completed',
      uploadId: uploadId,
      totalRows: combinedData.length,
      successful: successCount,
      failed: failedCount,
      uploadLog: uploadLog
    });

  } catch (error) {
    console.error('❌ MS-SQL sync error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Get status of last sync
 */
export const getSyncStatus = async (req, res) => {
  try {
    const lastSync = await UploadLog
      .findOne({ uploadType: 'api_sync' })
      .sort({ uploadedAt: -1 })
      .populate('userId', 'name email');

    if (!lastSync) {
      return res.json({
        success: true,
        message: 'No sync history found',
        lastSync: null
      });
    }

    res.json({
      success: true,
      lastSync: lastSync
    });

  } catch (error) {
    console.error('❌ Error fetching sync status:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Get all sync history
 */
export const getSyncHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const syncHistory = await UploadLog
      .find({ uploadType: 'api_sync' })
      .sort({ uploadedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('userId', 'name email');

    const count = await UploadLog.countDocuments({ uploadType: 'api_sync' });

    res.json({
      success: true,
      syncHistory,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      total: count
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export default {
  syncFromMSSQL,
  getSyncStatus,
  getSyncHistory
};