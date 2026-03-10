# FEN
Self-hosted personal website

---

## Git Workflow

### First-Time Setup (per machine)
```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"

# Clone the repo (if not already on the machine)
git clone https://github.com/yourusername/yourrepo.git
cd yourrepo
```

### Everyday Workflow: Making Changes & Pushing
```bash
# 1. Always pull latest before starting work
git pull origin main

# 2. Make your changes...

# 3. Check what changed
git status

# 4. Stage changes
git add .                        # Stage all changed files
git add index.html               # Stage a specific file
git add styles.css index.html    # Stage multiple specific files

# 5. Commit with a message
git commit -m "update warframe price checker layout"
git commit -m "fix broken link on privacy policy page"
git commit -m "add new section to home page"

# 6. Push to GitHub
git push origin main
```

### Pulling Changes on Your Fedora Machine
```bash
# Navigate to your project folder
cd /var/www/html/

# Pull the latest changes from GitHub
git pull origin main
```

### Making a New Repo
```bash
Step 1: create new repo on GitHub first and get the URL for it
Step 2: Navigate to the local project folder on your machine
git init                    #Creates a hidden .git folder in your project folder.
git add .
git commit -m "your initial commit comment/description"
git remote add origin https://github.com/yourusername/your-repo.git
git branch -M main
git push -u origin main

#if the URL is wrong fix it with:
git remote set-url origin https://github.com/yourusername/your-repo.git
```

### Useful Git Commands
```bash
git log --oneline            # See recent commit history
git diff                     # See unstaged changes
git diff --staged            # See staged (but uncommitted) changes
git restore filename.html    # Discard changes to a file
git stash                    # Temporarily shelve uncommitted changes
git stash pop                # Re-apply stashed changes
git branch                   # List branches
git checkout -b new-branch   # Create and switch to a new branch
git merge branch-name        # Merge a branch into current branch
git remote -v                # Checks which repo you're in and pointed at
git status                   # Will either show you your branch and file status, 
                             # or tell you you're not in a repo.
```

---

## Fedora Filesystem & Terminal Commands

### Navigation
```bash
pwd                          # Print current directory
ls                           # List files
ls -la                       # List all files (including hidden) with details
cd /path/to/folder           # Change directory
cd ~                         # Go to home directory
cd ..                        # Go up one directory
```

### File & Folder Management
```bash
mkdir folder-name            # Create a new directory
touch filename.txt           # Create an empty file
cp file.txt /path/to/dest/   # Copy a file
mv file.txt /path/to/dest/   # Move or rename a file
rm filename.txt              # Delete a file
rm -r folder-name/           # Delete a folder and its contents
```

### Viewing & Editing Files
```bash
cat filename.txt             # Print file contents to terminal
less filename.txt            # Scroll through a file (q to quit)
nano filename.txt            # Open file in nano text editor
sudo nano /etc/somefile      # Edit a system file as root
```

### Permissions
```bash
chmod +x script.sh           # Make a file executable
chown user:group filename    # Change file owner
sudo chown -R user /folder   # Recursively change folder owner
```

### System Info
```bash
df -h                        # Disk usage (human readable)
free -h                      # RAM usage
top                          # Live process monitor (q to quit)
htop                         # Nicer process monitor (if installed)
uname -r                     # Kernel version
hostname -I                  # Show local IP address(es)
```

### Networking
```bash
ping google.com              # Test internet connection
curl -4 ifconfig.me          # Show your public IP
ss -tuln                     # Show open ports
```

### Package Management (DNF)
```bash
sudo dnf update              # Update all packages
sudo dnf install package     # Install a package
sudo dnf remove package      # Remove a package
sudo dnf search keyword      # Search for a package
```

### Services (systemctl)
```bash
sudo systemctl status nginx       # Check service status
sudo systemctl start nginx        # Start a service
sudo systemctl stop nginx         # Stop a service
sudo systemctl restart nginx      # Restart a service
sudo systemctl enable nginx       # Start service on boot
sudo systemctl disable nginx      # Disable start on boot
```

### Searching
```bash
find /path -name "filename"       # Find a file by name
grep -r "search term" /path/      # Search inside files recursively
which command-name                # Find where a command lives
```
