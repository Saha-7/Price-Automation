import express from 'express';
import { authenticateUser, canApprove } from '../middleware/auth.js';
import * as productController from '../controllers/productController.js';

const router = express.Router();

/**
 * @route   GET /api/products/filters/brands
 * @desc    Get all unique brands
 * @access  Private
 */
router.get('/filters/brands', authenticateUser, productController.getAllBrands);

/**
 * @route   GET /api/products/filters/types
 * @desc    Get all unique product types
 * @access  Private
 */
router.get('/filters/types', authenticateUser, productController.getAllProductTypes);

/**
 * @route   GET /api/products
 * @desc    Get all products with pagination and filters
 * @access  Private
 */
router.get('/', authenticateUser, productController.getAllProducts);

/**
 * @route   GET /api/products/:sku
 * @desc    Get product by SKU
 * @access  Private
 */
router.get('/:sku', authenticateUser, productController.getProductBySKU);

/**
 * @route   GET /api/products/:sku/history
 * @desc    Get product price history
 * @access  Private
 */
router.get('/:sku/history', authenticateUser, productController.getProductPriceHistory);

/**
 * @route   PUT /api/products/:sku/price
 * @desc    Update product price manually
 * @access  Private (Manager/Admin)
 */
router.put('/:sku/price', authenticateUser, canApprove, productController.updateProductPrice);

/**
 * @route   GET /api/products/brand/:brand
 * @desc    Get products by brand
 * @access  Private
 */
router.get('/brand/:brand', authenticateUser, productController.getProductsByBrand);

/**
 * @route   GET /api/products/type/:type
 * @desc    Get products by type
 * @access  Private
 */
router.get('/type/:type', authenticateUser, productController.getProductsByType);

export default router;