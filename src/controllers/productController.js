import Product from '../models/Product.js';

/**
 * Product Controller
 * Handles all product-related operations
 */

/**
 * Get all products with pagination and filters
 */
export const getAllProducts = async (req, res) => {
  try {
    const { page = 1, limit = 50, brand, productType, search } = req.query;
    
    const query = {};
    
    // Apply filters
    if (brand) query.brand = brand;
    if (productType) query.productType = productType;
    if (search) {
      query.$or = [
        { sku: { $regex: search, $options: 'i' } },
        { productName: { $regex: search, $options: 'i' } }
      ];
    }

    // Fetch products with pagination
    const products = await Product.find(query)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ updatedAt: -1 });

    const count = await Product.countDocuments(query);

    res.json({
      success: true,
      products,
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
 * Get product by SKU
 */
export const getProductBySKU = async (req, res) => {
  try {
    const product = await Product.findOne({ 
      sku: req.params.sku.toUpperCase() 
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      product
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Get product price history
 */
export const getProductPriceHistory = async (req, res) => {
  try {
    const product = await Product.findOne({ 
      sku: req.params.sku.toUpperCase() 
    }).select('sku productName priceHistory');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      sku: product.sku,
      productName: product.productName,
      priceHistory: product.priceHistory
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Update product price manually
 */
export const updateProductPrice = async (req, res) => {
  try {
    const { newPrice } = req.body;
    
    if (!newPrice || newPrice <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid price value'
      });
    }

    const product = await Product.findOne({ 
      sku: req.params.sku.toUpperCase() 
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Add to price history
    product.addPriceHistory(
      newPrice,
      'manual_update',
      req.user._id,
      req.user.name
    );

    await product.save();

    res.json({
      success: true,
      message: 'Price updated successfully',
      product
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Get products by brand
 */
export const getProductsByBrand = async (req, res) => {
  try {
    const products = await Product.find({ 
      brand: req.params.brand 
    }).sort({ updatedAt: -1 });

    res.json({
      success: true,
      brand: req.params.brand,
      count: products.length,
      products
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Get products by type
 */
export const getProductsByType = async (req, res) => {
  try {
    const products = await Product.find({ 
      productType: req.params.type 
    }).sort({ updatedAt: -1 });

    res.json({
      success: true,
      productType: req.params.type,
      count: products.length,
      products
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Get all unique brands
 */
export const getAllBrands = async (req, res) => {
  try {
    const brands = await Product.distinct('brand');
    
    res.json({
      success: true,
      count: brands.length,
      brands: brands.filter(Boolean).sort()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Get all unique product types
 */
export const getAllProductTypes = async (req, res) => {
  try {
    const productTypes = await Product.distinct('productType');
    
    res.json({
      success: true,
      count: productTypes.length,
      productTypes: productTypes.filter(Boolean).sort()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export default {
  getAllProducts,
  getProductBySKU,
  getProductPriceHistory,
  updateProductPrice,
  getProductsByBrand,
  getProductsByType,
  getAllBrands,
  getAllProductTypes
};