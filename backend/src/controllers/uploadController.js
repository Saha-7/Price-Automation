import UploadLog from '../models/UploadLog.js';

/**
 * Upload Controller
 * Handles CSV/Excel file uploads
 */

/**
 * Upload CSV file with purchase prices
 * TODO: Implement full CSV upload logic
 */
export const uploadCSV = async (req, res) => {
  try {
    // Placeholder - will be implemented after MS-SQL sync is working
    res.json({
      success: false,
      message: 'CSV upload feature coming soon'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Get upload history
 */
export const getUploadHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10, uploadType } = req.query;
    
    const query = {};
    if (uploadType) {
      query.uploadType = uploadType;
    }

    const uploads = await UploadLog
      .find(query)
      .sort({ uploadedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('userId', 'name email');

    const count = await UploadLog.countDocuments(query);

    res.json({
      success: true,
      uploads,
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

/**
 * Get specific upload details by uploadId
 */
export const getUploadById = async (req, res) => {
  try {
    const upload = await UploadLog
      .findOne({ uploadId: req.params.uploadId })
      .populate('userId', 'name email');

    if (!upload) {
      return res.status(404).json({
        success: false,
        message: 'Upload not found'
      });
    }

    res.json({
      success: true,
      upload
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export default {
  uploadCSV,
  getUploadHistory,
  getUploadById
};