import axios from 'axios';

/**
 * MS-SQL API Service
 * Handles API calls to internal MS-SQL backed APIs
 * 
 * Supports multiple authentication methods:
 * - API Key (X-API-Key header)
 * - Bearer Token (Authorization header)
 * - Basic Auth (username/password)
 */

class MSSQLAPIService {
  constructor() {
    this.zohoApiUrl = process.env.MSSQL_API_ZOHO_URL;
    this.shopifySkusApiUrl = process.env.MSSQL_API_SHOPIFY_SKUS_URL;
    
    // Determine authentication method based on env variables
    this.authMethod = this.determineAuthMethod();
  }

  /**
   * Determine which authentication method to use
   */
  determineAuthMethod() {
    if (process.env.MSSQL_API_KEY) {
      return 'api_key';
    } else if (process.env.MSSQL_API_TOKEN) {
      return 'bearer_token';
    } else if (process.env.MSSQL_API_USERNAME && process.env.MSSQL_API_PASSWORD) {
      return 'basic_auth';
    } else {
      return 'none';
    }
  }

  /**
   * Get authentication headers based on method
   */
  getAuthHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    };

    switch (this.authMethod) {
      case 'api_key':
        headers['X-API-Key'] = process.env.MSSQL_API_KEY;
        break;
      case 'bearer_token':
        headers['Authorization'] = `Bearer ${process.env.MSSQL_API_TOKEN}`;
        break;
      // Basic auth is handled separately in axios config
      default:
        break;
    }

    return headers;
  }

  /**
   * Get axios config with authentication
   */
  getAxiosConfig() {
    const config = {
      headers: this.getAuthHeaders(),
      timeout: 30000 // 30 second timeout
    };

    if (this.authMethod === 'basic_auth') {
      config.auth = {
        username: process.env.MSSQL_API_USERNAME,
        password: process.env.MSSQL_API_PASSWORD
      };
    }

    return config;
  }

  /**
   * Fetch purchase prices from Zoho Bills API
   * @returns {Promise<Array>} Purchase price data
   */
  async fetchPurchasePrices() {
    try {
      console.log('📡 Fetching purchase prices from Zoho API...');
      
      if (!this.zohoApiUrl) {
        throw new Error('MSSQL_API_ZOHO_URL not configured');
      }

      const response = await axios.get(this.zohoApiUrl, this.getAxiosConfig());
      
      console.log(`✅ Fetched ${response.data.length || 0} purchase price records`);
      
      return response.data;
      
    } catch (error) {
      console.error('❌ Error fetching purchase prices:', error.message);
      throw new Error(`Failed to fetch purchase prices: ${error.message}`);
    }
  }

  /**
   * Fetch Shopify SKU data from Scanner API
   * @returns {Promise<Array>} Shopify SKU data
   */
  async fetchShopifySKUs() {
    try {
      console.log('📡 Fetching Shopify SKU data from Scanner API...');
      
      if (!this.shopifySkusApiUrl) {
        throw new Error('MSSQL_API_SHOPIFY_SKUS_URL not configured');
      }

      const response = await axios.get(this.shopifySkusApiUrl, this.getAxiosConfig());
      
      console.log(`✅ Fetched ${response.data.length || 0} Shopify SKU records`);
      
      return response.data;
      
    } catch (error) {
      console.error('❌ Error fetching Shopify SKUs:', error.message);
      throw new Error(`Failed to fetch Shopify SKUs: ${error.message}`);
    }
  }

  /**
   * Fetch and combine data from both APIs
   * @returns {Promise<Array>} Combined product data
   */
  async fetchCombinedData() {
    try {
      console.log('🔄 Fetching data from both APIs...');

      // Fetch from both APIs in parallel
      const [purchasePrices, shopifySKUs] = await Promise.all([
        this.fetchPurchasePrices(),
        this.fetchShopifySKUs()
      ]);

      // Combine the data
      const combinedData = this.combineData(purchasePrices, shopifySKUs);
      
      console.log(`✅ Combined data for ${combinedData.length} products`);
      
      return combinedData;
      
    } catch (error) {
      console.error('❌ Error fetching combined data:', error.message);
      throw error;
    }
  }

  /**
   * Combine purchase price and SKU data
   * Matches by product title (case-insensitive)
   * 
   * @param {Array} purchasePrices - Data from bills_data table
   * @param {Array} shopifySKUs - Data from Scanner_shopify_product_skus table
   * @returns {Array} Combined product data
   */
  combineData(purchasePrices, shopifySKUs) {
    const combined = shopifySKUs.map(skuData => {
      // Try to find matching purchase price by product title
      const matchingPrice = purchasePrices.find(priceData => {
        const title1 = (priceData.product_title || priceData.Product_Title || '').toLowerCase().trim();
        const title2 = (skuData.product_title || skuData.Product_Title || '').toLowerCase().trim();
        return title1 === title2;
      });

      return {
        sku: skuData.sku || skuData.SKU,
        productName: skuData.product_title || skuData.Product_Title,
        productType: skuData.product_type || skuData.Product_Type,
        brand: skuData.brand || skuData.Brand,
        mrp: skuData.price || skuData.Price,
        currentSellingPrice: skuData.compare_price || skuData.ComparePrice,
        purchasePrice: matchingPrice ? (matchingPrice.purchase_price || matchingPrice.Purchase_Price) : null,
        dataSource: 'api_sync'
      };
    });

    return combined;
  }
}

// Export singleton instance
export default new MSSQLAPIService();