# 🏦 Koni Bank - Professional Banking Platform

A modern, secure, and feature-rich digital banking platform built with Node.js, Express, and SQLite.

![Koni Bank](frontend/public/assets/images/logo.png)

## ✨ Features

### 🛡️ Security
- **Bank-Grade Encryption**: AES-256 encryption for all sensitive data
- **Two-Factor Authentication**: TOTP-based 2FA with QR code setup
- **JWT Tokens**: Secure token-based authentication with refresh
- **Rate Limiting**: Protection against brute force attacks
- **CSRF Protection**: Cross-Site Request Forgery protection
- **SQL Injection Prevention**: Parameterized queries

### 💰 Banking Features
- **Multiple Accounts**: Savings, Current, Fixed Deposit accounts
- **Instant Transfers**: Real-time fund transfers between accounts
- **Transaction History**: Detailed transaction records with filters
- **Balance Management**: Real-time balance updates
- **Account Statements**: PDF statement generation
- **Loan Management**: Complete loan lifecycle management

### 📱 User Experience
- **Responsive Design**: Works on all devices
- **PWA Support**: Install as native app
- **Real-time Notifications**: In-app and email notifications
- **Dark/Light Mode**: User preference based theming
- **Animations**: Smooth UI transitions and feedback

### 🏗️ Technical Features
- **Modular Architecture**: Clean separation of concerns
- **RESTful API**: Well-documented API endpoints
- **Database Migrations**: Version-controlled database schema
- **Automated Backups**: Scheduled database backups
- **Cron Jobs**: Automated EMI processing, interest calculation
- **Audit Logging**: Complete audit trail of all actions

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- SQLite3
- npm or yran