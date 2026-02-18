# Client Information Checklist

Use this checklist when talking to your client to gather all necessary information for deployment.

---

## 📋 Server Information

### Basic Server Access
- [ ] **Server IP Address / Hostname**: `_________________`
- [ ] **SSH Username**: `_________________`
- [ ] **SSH Access Method**: 
  - [ ] Private Key (provide key file)
  - [ ] Password (provide password)
- [ ] **Server Operating System**: `_________________` (Ubuntu 22.04 recommended)
- [ ] **Server Provider**: `_________________` (AWS, DigitalOcean, Azure, etc.)

### Server Status
- [ ] Is Docker already installed? Yes / No
- [ ] Is Docker Compose already installed? Yes / No
- [ ] Do you have root/sudo access? Yes / No
- [ ] What ports are currently open? `_________________`

---

## 🗄️ Database Configuration

- [ ] **PostgreSQL Password**: `_________________` (must be strong!)
- [ ] **Database Name**: `_________________` (default: `food_delivery`)
- [ ] **Preferred Database User**: `_________________` (default: `postgres`)

**Note:** We'll use PostgreSQL 15. If you have a different version, let us know.

---

## 🔐 Security Secrets

- [ ] **JWT Secret**: `_________________` 
  - *We can generate this for you using: `openssl rand -base64 32`*
- [ ] **PostgreSQL Password**: `_________________` (already asked above)

---

## 📧 Email Configuration (SMTP)

**For Production Email Notifications:**

- [ ] **SMTP Provider**: `_________________` (Gmail, SendGrid, AWS SES, etc.)
- [ ] **SMTP Host**: `_________________` (e.g., `smtp.gmail.com`)
- [ ] **SMTP Port**: `_________________` (usually `587` for TLS or `465` for SSL)
- [ ] **SMTP Username**: `_________________` (email address)
- [ ] **SMTP Password**: `_________________` (app password, not regular password)
- [ ] **SMTP From Address**: `_________________` (sender email)
- [ ] **Use SSL/TLS?**: Yes / No (usually TLS for port 587)

**For Development:**
- [ ] Can we skip email setup for now? Yes / No (emails will be logged to console)

---

## 🌐 Domain & SSL (Optional but Recommended)

- [ ] **Domain Name**: `_________________` (e.g., `api.foodapp.com`)
- [ ] **Do you want HTTPS?**: Yes / No
- [ ] **Can you configure DNS?**: Yes / No
  - If yes, point domain to server IP: `_________________`
- [ ] **SSL Certificate**: 
  - [ ] We'll use Let's Encrypt (free)
  - [ ] You'll provide certificate
  - [ ] Not needed for now

---

## 🔗 GitHub Repository

- [ ] **Repository URL**: `https://github.com/_________________/_________________`
- [ ] **GitHub Username/Organization**: `_________________`
- [ ] **Repository Access**: 
  - [ ] Public repository
  - [ ] Private repository (need access)
- [ ] **GitHub Personal Access Token (PAT)**: `_________________`
  - *We'll need this for GitHub Container Registry*
  - *Create at: https://github.com/settings/tokens*
  - *Needs `write:packages` permission*

---

## 👤 First Admin User

- [ ] **Admin Email**: `_________________`
- [ ] **Admin Password**: `_________________` (must be strong!)
- [ ] **Admin Name**: `_________________` (optional)

**Note:** This will be the first admin account created automatically.

---

## 📦 Additional Requirements

### Storage
- [ ] **File Storage**: 
  - [ ] Local storage (on server)
  - [ ] AWS S3
  - [ ] Other: `_________________`

### Monitoring
- [ ] **Do you want monitoring?**: Yes / No
- [ ] **Preferred monitoring tool**: `_________________`

### Backups
- [ ] **Backup Strategy**: 
  - [ ] Automated daily backups (recommended)
  - [ ] Manual backups
  - [ ] Cloud backup (AWS S3, etc.)

---

## ✅ Deployment Preferences

- [ ] **Deployment Method**:
  - [ ] Automated CI/CD (push to GitHub → auto-deploy)
  - [ ] Manual deployment (we'll deploy when you ask)

- [ ] **Deployment Time**: `_________________` (when do you want to deploy?)

- [ ] **Environment**:
  - [ ] Production (live)
  - [ ] Staging (testing)
  - [ ] Development

---

## 📝 Notes & Special Requirements

**Any special requirements or notes:**

```
_________________________________________________
_________________________________________________
_________________________________________________
```

---

## 🎯 Quick Questions for Client

**Copy these questions and send to client:**

1. Do you have a server ready? If yes, what's the IP address and SSH access?
2. What password should we use for the database? (must be strong)
3. Do you have email service (SMTP) credentials for sending notifications?
4. Do you have a domain name? If yes, what is it?
5. Is your code on GitHub? What's the repository URL?
6. What email should be used for the first admin account?
7. When do you want to deploy? (timeline)

---

## 📞 Contact Information

**Client Contact:**
- **Name**: `_________________`
- **Email**: `_________________`
- **Phone**: `_________________`
- **Preferred Communication**: Email / Phone / Slack / Other

---

## ✅ Completion Status

- [ ] All server information collected
- [ ] All credentials obtained
- [ ] GitHub repository access confirmed
- [ ] Deployment timeline agreed
- [ ] Client understands next steps

**Date Completed**: `_________________`
**Completed By**: `_________________`

---

## 🚀 Next Steps After Collection

1. ✅ Set up server (if not done)
2. ✅ Configure GitHub Secrets
3. ✅ Test deployment
4. ✅ Verify all services work
5. ✅ Hand over to client

---

**Last Updated**: `_________________`
