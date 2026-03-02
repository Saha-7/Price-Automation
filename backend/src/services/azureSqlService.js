import sql from 'mssql';

/**
 * Azure SQL Server Service
 * Connects directly to Azure SQL databases using Managed Identity
 * 
 * Database 1: db_Zoho_AMZ_API
 * View: [dbo].[vw_Zoho_Bills_Data]
 * 
 * Database 2: db_returns
 * View: dbo.vw_Shopify_Product_SKUs
 */

class AzureSQLService {
  constructor() {
    // Database 1: Zoho Bills
    this.zohoConfig = {
      server: process.env.AZURE_SQL_SERVER,
      database: process.env.AZURE_SQL_DATABASE_ZOHO || 'db_Zoho_AMZ_API',
      authentication: {
        type: 'azure-active-directory-default' // Uses Managed Identity
      },
      options: {
        encrypt: true,
        trustServerCertificate: false,
        connectTimeout: 30000
      }
    };

    // Database 2: Returns/Shopify SKUs
    this.returnsConfig = {
      server: process.env.AZURE_SQL_SERVER,
      database: process.env.AZURE_SQL_DATABASE_RETURNS || 'db_returns',
      authentication: {
        type: 'azure-active-directory-default' // Uses Managed Identity
      },
      options: {
        encrypt: true,
        trustServerCertificate: false,
        connectTimeout: 30000
      }
    };
  }

  /**
   * Fetch purchase prices from Zoho Bills view
   * @returns {Promise<Array>} Purchase price data
   */
  async fetchPurchasePrices() {
    let pool;
    try {
      console.log('📡 Connecting to db_Zoho_AMZ_API...');
      
      pool = await sql.connect(this.zohoConfig);
      
      console.log('✅ Connected! Fetching from [dbo].[vw_Zoho_Bills_Data]...');
      
      const result = await pool.request().query(`
        SELECT 
          Product_Title,
          Purchase_Price
        FROM [dbo].[vw_Zoho_Bills_Data]
      `);
      
      console.log(`✅ Fetched ${result.recordset.length} purchase price records`);
      
      return result.recordset;
      
    } catch (error) {
      console.error('❌ Error fetching purchase prices:', error.message);
      throw new Error(`Failed to fetch purchase prices: ${error.message}`);
    } finally {
      if (pool) {
        await pool.close();
      }
    }
  }

  /**
   * Fetch Shopify SKU data from returns database
   * @returns {Promise<Array>} Shopify SKU data
   */
  async fetchShopifySKUs() {
    let pool;
    try {
      console.log('📡 Connecting to db_returns...');
      
      pool = await sql.connect(this.returnsConfig);
      
      console.log('✅ Connected! Fetching from dbo.vw_Shopify_Product_SKUs...');
      
      const result = await pool.request().query(`
        SELECT 
          Product_Type,
          SKU,
          Brand,
          Price,
          ComparePrice
        FROM dbo.vw_Shopify_Product_SKUs
      `);
      
      console.log(`✅ Fetched ${result.recordset.length} Shopify SKU records`);
      
      return result.recordset;
      
    } catch (error) {
      console.error('❌ Error fetching Shopify SKUs:', error.message);
      throw new Error(`Failed to fetch Shopify SKUs: ${error.message}`);
    } finally {
      if (pool) {
        await pool.close();
      }
    }
  }

  /**
   * Fetch and combine data from both databases
   * @returns {Promise<Array>} Combined product data
   */
  async fetchCombinedData() {
    try {
      console.log('🔄 Fetching data from both SQL databases...');

      // Fetch from both databases in parallel
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
   * @param {Array} purchasePrices - Data from vw_Zoho_Bills_Data
   * @param {Array} shopifySKUs - Data from vw_Shopify_Product_SKUs
   * @returns {Array} Combined product data
   */
  combineData(purchasePrices, shopifySKUs) {
    const combined = shopifySKUs.map(skuData => {
      // Try to find matching purchase price by product title
      const matchingPrice = purchasePrices.find(priceData => {
        const title1 = (priceData.Product_Title || '').toLowerCase().trim();
        const title2 = (skuData.Product_Title || '').toLowerCase().trim();
        return title1 === title2;
      });

      return {
        sku: skuData.SKU,
        productName: skuData.Product_Title || 'Unknown',
        productType: skuData.Product_Type,
        brand: skuData.Brand,
        mrp: skuData.Price,
        currentSellingPrice: skuData.ComparePrice,
        purchasePrice: matchingPrice ? matchingPrice.Purchase_Price : null,
        dataSource: 'api_sync'
      };
    });

    return combined;
  }
}

// Export singleton instance
export default new AzureSQLService();