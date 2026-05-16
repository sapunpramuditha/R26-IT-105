const User = require('../models/User');
const Admin = require('../models/Admin');
const jwt = require('jsonwebtoken');

// Generate JWT
const sendTokenResponse = (modelInstance, statusCode, res) => {
    const token = jwt.sign({ id: modelInstance._id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN
    });

    res.status(statusCode).json({
        success: true,
        token,
        user: {
            id: modelInstance._id,
            name: modelInstance.name || modelInstance.username,
            email: modelInstance.email || undefined,
            role: modelInstance.username ? 'admin' : 'user'
        }
    });
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.registerUser = async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const user = await User.create({
            name,
            email,
            password
        });
        sendTokenResponse(user, 201, res);
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Please provide an email and password' });
        }

        const user = await User.findOne({ email }).select('+password');
        if (!user) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        sendTokenResponse(user, 200, res);
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Admin login
// @route   POST /api/auth/admin-login
// @access  Public
exports.loginAdmin = async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'Please provide username and password' });
        }

        // For first time setup, if no admin exists, create one (FOR DEV PURPOSES ONLY)
        let admin = await Admin.findOne({ username }).select('+password');
        if (!admin && username === 'admin') {
           admin = await Admin.create({username: 'admin', password: 'admin123'});
        } else if (!admin) {
           return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        const isMatch = await admin.matchPassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        sendTokenResponse(admin, 200, res);
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Get current logged in user/admin
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
    const userData = req.user.toObject ? req.user.toObject() : req.user;
    res.status(200).json({
        success: true,
        data: {
            ...userData,
            role: req.user.role
        }
    });
};

// @desc    Get all users (candidates)
// @route   GET /api/auth/users
// @access  Private/Admin
exports.getUsers = async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            count: users.length,
            data: users
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};
