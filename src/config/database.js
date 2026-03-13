import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    // For Azure Managed Identity (no username/password in URI)
    const options = {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    // Only add authMechanism if using Azure Managed Identity
    if (process.env.USE_AZURE_MANAGED_IDENTITY === 'true') {
      options.authMechanism = 'MONGODB-X509';
      options.tls = true;
      options.tlsAllowInvalidCertificates = false;
    }

    const conn = await mongoose.connect(process.env.MONGODB_URI, options);

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📊 Database Name: ${conn.connection.name}`);
    
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    
    // Provide helpful error messages
    if (error.message.includes('authentication failed') || error.message.includes('bad auth')) {
      console.error('\n💡 Troubleshooting Tips:');
      console.error('   1. Check MONGODB_URI in .env file');
      console.error('   2. Verify username/password are correct');
      console.error('   3. Check if database user has proper permissions');
      console.error('   4. For Azure: Enable Managed Identity in Azure Portal\n');
    }
    
    // Retry connection after 5 seconds
    console.log('⏳ Will retry connection in 5 seconds...');
    setTimeout(connectDB, 5000);
  }
};

// Handle connection events
mongoose.connection.on('disconnected', () => {
  console.log('⚠️  MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('error', (err) => {
  console.error(`❌ MongoDB error: ${err.message}`);
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnected');
});

export default connectDB;