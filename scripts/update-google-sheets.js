const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

// Get credentials from environment variable
const getCredentials = () => {
  const credsJson = process.env.GOOGLE_CREDENTIALS;
  if (!credsJson) {
    console.error('GOOGLE_CREDENTIALS environment variable is not set');
    process.exit(1);
  }
  try {
    return JSON.parse(credsJson);
  } catch (e) {
    console.error('Failed to parse GOOGLE_CREDENTIALS:', e.message);
    process.exit(1);
  }
};

// Load scraped listings from JSON file
const loadListings = () => {
  const filePath = path.join(__dirname, '../data/current-listings.json');
  if (!fs.existsSync(filePath)) {
    console.log('No current-listings.json found.');
    return [];
  }
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    console.error('Failed to load listings:', e.message);
    return [];
  }
};

// Authenticate with Google Sheets API
const authenticateGoogle = async (credentials) => {
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return auth.getClient();
};

// Update Google Sheet with listings
const updateGoogleSheet = async (auth, spreadsheetId, listings) => {
  const sheets = google.sheets({ version: 'v4', auth });

  if (listings.length === 0) {
    console.log('No listings to update.');
    return;
  }

  // Prepare data rows
  const values = listings.map(listing => [
    listing.id || '',
    listing.title || '',
    listing.price || '',
    listing.area || '',
    listing.room || '',
    listing.url || '',
    listing.scrapedAt || new Date().toISOString()
  ]);

  try {
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A2',
      valueInputOption: 'RAW',
      resource: { values: values }
    });

    console.log(`Updated ${response.data.updates.updatedRows} rows in Google Sheet`);
  } catch (error) {
    console.error('Failed to update Google Sheet:', error.message);
    throw error;
  }
};

// Main function
const main = async () => {
  try {
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    if (!spreadsheetId) {
      console.error('GOOGLE_SPREADSHEET_ID environment variable is not set');
      process.exit(1);
    }

    console.log('Loading listings...');
    const listings = loadListings();
    console.log(`Found ${listings.length} listings`);

    if (listings.length === 0) {
      console.log('No listings to process.');
      return;
    }

    console.log('Authenticating with Google Sheets API...');
    const credentials = getCredentials();
    const auth = await authenticateGoogle(credentials);

    console.log('Updating Google Sheet...');
    await updateGoogleSheet(auth, spreadsheetId, listings);

    console.log('Done!');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

if (require.main === module) {
  main();
}

module.exports = { updateGoogleSheet, loadListings };
