const express = require('express');
const auth = require('../middleware/auth');

const router = express.Router();

const ROLE_PERMISSIONS = {
  admin: {
    recipe_master: ['create', 'read', 'update', 'delete'],
    cocoa_processing: ['create', 'read', 'update'],
    chocolate_production: ['create', 'read', 'update'],
    batch_tracking: ['read'],
    processing_reports: ['read', 'export_excel', 'export_pdf'],
    users: ['create', 'read', 'update', 'delete'],
  },
  staff: {
    recipe_master: ['read'],
    cocoa_processing: ['create', 'read', 'update'],
    chocolate_production: ['create', 'read', 'update'],
    batch_tracking: ['read'],
    processing_reports: ['read', 'export_excel', 'export_pdf'],
    users: ['read'],
  },
};

router.get('/', auth, async (req, res) => {
  const role = req.user?.role || 'staff';
  res.json({
    role,
    permissions: ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.staff,
  });
});

module.exports = router;
