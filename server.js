const express = require('express');
const app = express();
const path = require('path');
const port = process.env.PORT || 3000;

// Serve files from the 'public' directory
app.use(express.static('public'));

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
