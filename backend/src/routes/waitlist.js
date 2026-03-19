import express from 'express';
import crypto from 'crypto';
import Waitlist from '../models/Waitlist.js';
import { appendToSheet } from '../services/googleSheets.js';
// import { sendWelcomeAndVerifyEmail } from '../services/resend.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { firstName, lastName, email, courseInterest, tierInterest, domains } = req.body;

    if (!firstName || !email) {
      return res.status(400).json({ success: false, message: 'First name and email are required.' });
    }

    // Check for existing user
    const existingUser = await Waitlist.findOne({ email });
    if (existingUser) {
      if (existingUser.isVerified) {
        return res.status(400).json({ success: false, message: 'This email is already verified and on the waitlist.' });
      } else {
        // Since emails are disabled, just tell them they are already registered
        return res.status(400).json({ success: false, message: 'This email is already on the waitlist pending verification.' });
      }
    }

    // Generate Verification Token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Save to DB
    const newEntry = new Waitlist({ 
      firstName, 
      lastName, 
      email, 
      courseInterest, 
      tierInterest, 
      domains,
      verificationToken 
    });
    await newEntry.save();

    // Send the Verification Email
    // await sendWelcomeAndVerifyEmail(firstName, email, verificationToken);

    // Make Google Sheets more readable and informed
    const name = `${firstName} ${lastName || ''}`.trim();
    const domainStr = Array.isArray(domains) ? domains.join(', ') : domains;
    const dateStr = new Date().toLocaleString();
    
    // Better formatted array for Google Sheets
    const sheetData = [
      dateStr,                               // Timestamp
      name,                                  // Full Name
      email,                                 // Email Address
      courseInterest || 'None specified',    // Chosen Course
      tierInterest || 'None specified',      // Targeted Tier
      domainStr || 'None selected',          // Interested Domains
      'Pending Verification ⏳'              // Verification Status
    ];

    // Execute sheet append in background
    appendToSheet(sheetData).catch(err => {
      console.error('Background Google Sheets append failed:', err);
    });

    res.status(201).json({ success: true, message: 'Added to waitlist. Verification email sent.' });
  } catch (error) {
    console.error('Waitlist error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/waitlist/verify?token=...
router.get('/verify', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).send('<h3>Invalid request</h3>');
    }

    const user = await Waitlist.findOne({ verificationToken: token });
    if (!user) {
      return res.status(400).send('<h3>Invalid or expired verification token.</h3>');
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();

    // We can directly inform them via HTML output
    return res.send(`
      <div style="font-family: sans-serif; text-align: center; padding: 40px;">
        <h1 style="color: #34d399;">Verification Successful! 🎉</h1>
        <p>Your email <strong>${user.email}</strong> has been successfully verified.</p>
        <p>You are now officially on the MasterFuture waiting list!</p>
        <a href="http://localhost:5173" style="display:inline-block; margin-top:20px; padding:10px 20px; background:#7c3aed; color:#fff; text-decoration:none; border-radius:5px;">Return to Website</a>
      </div>
    `);
  } catch (err) {
    console.error('Verification error:', err);
    res.status(500).send('<h3>Server error during verification.</h3>');
  }
});

export default router;
