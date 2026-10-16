const express = require('express');
const router = express.Router();
const { 
    createUser, 
    getUsersWithPagination, 
    sendCredentialsEmail, 
    toggleUserStatus,
    deleteUser
} = require('../controllers/userController');

router.post('/create-user', createUser);                          // User create (bina mail ke)
router.get('/users',getUsersWithPagination);                     // Pagination & Search ke sath list
router.post('/send-credentials', sendCredentialsEmail);           // Alag se email send karne ke liye
router.patch('/users/:id/status', toggleUserStatus); // Deactivate/Activate route
router.delete('/users/:id',deleteUser);
module.exports = router;