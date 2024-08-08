
const allAvatars = ['images/avatars/a1.png', 'images/avatars/a2.png']

class RewardState {
    constructor() {
        this.xp = 0;
        this.ownedAvatars = [allAvatars[0]];
        this.selectedAvatar = this.ownedAvatars[0];
        this.firstGameOfDayBonusDate = new Date(0);

        // If you play multiple days in a row you get a bonus
        this.streakStartDate = null;
        this.streakEndDate = null;
    }

    // Static method to create a new instance by loading from local storage
    static load() {
        let rewardState = new RewardState();
        let savedState = localStorage.getItem('rewardState');
        if (savedState !== null) {
            let data = JSON.parse(savedState);
            rewardState.xp = data.xp;
            rewardState.ownedAvatars = data.ownedAvatars;
            rewardState.selectedAvatar = data.selectedAvatar;
            // Convert the dates back to date objects.
            rewardState.firstGameOfDayBonusDate = new Date(data.firstGameOfDayBonusDate);
            rewardState.streakStartDate = new Date(data.streakStartDate);
            rewardState.streakEndDate = new Date(data.streakEndDate);
        }
        return rewardState;
    }

    save() {
        localStorage.setItem('rewardState', JSON.stringify(this));
    }

    getLevel() {
        // Level is exponentially related to xp
        if (this.xp == 0) {
            return 1;
        }
        return Math.floor(Math.log2(this.xp));
    }

    getXPForNextLevel() {
        return Math.pow(2, this.getLevel() + 1);
    }

    getFirstGameOfDayBonus(now) {
        let lastBonusDate = new Date(this.firstGameOfDayBonusDate);
        // Only give a bonus if the last bonus was not today (checking year, month and day)
        if (lastBonusDate.getFullYear() != now.getFullYear() || lastBonusDate.getMonth() != now.getMonth() || lastBonusDate.getDate() != now.getDate()) {
            return 10;
        }
        return 0;
    }

    hasStreak(now) {
        if (this.streakStartDate === null || this.streakEndDate === null) {
            return false;
        }

        // If streak end is not today or yesterday, the streak is broken
        let yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        if (!isSameDay(this.streakEndDate, now) && !isSameDay(this.streakEndDate, yesterday)) {
            return false;
        }
        return true;
    }

    getStreakLength(now) {
        // Compute the number of days in a row the player has played
        if (!this.hasStreak(now)) {
            return 0;
        }

        const diffTime = Math.abs(this.streakEndDate - this.streakStartDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
        
    }

    getStreakBonus(now) {
        let streakLength = this.getStreakLength(now);
        if (streakLength == 0) {
            return 0;
        }

        // If this.streakEndDate is today, they already got this reward so return 0
        if (isSameDay(this.streakEndDate, now)) {
            return 0;
        }
        return 10;
    }

    getWinBonus() {
        return 10;
    }

    getLossBonus() {
        return 2;
    }

    getRandomNotOwnedAvatar() {
        let notOwnedAvatars = allAvatars.filter(avatar => !this.ownedAvatars.includes(avatar));
        if (notOwnedAvatars.length == 0) {
            return null;
        }
        return notOwnedAvatars[Math.floor(Math.random() * notOwnedAvatars.length)];
    }

    addAvatar(avatar) {
        this.ownedAvatars.push(avatar);
        this.save();
    }

    setXp(xp) {
        this.xp = xp;
        this.save();
    }

    setSelectedAvatar(avatar) {
        this.selectedAvatar = avatar;
        this.save();
    }
}

function isSameDay(date1, date2) {
    return date1.getFullYear() == date2.getFullYear() && date1.getMonth() == date2.getMonth() && date1.getDate() == date2.getDate();
}

// Test method to list the different levels for different XP values
function testLevels() {
    let reward = new RewardState();
    for (let i = 0; i < 1000; i++) {
        reward.xp = i;
        console.log("XP:", i, "Level:", reward.getLevel());
    }
}

function applyReward(isWin) {
    rewards = {};
    const rewardState = RewardState.load()
    let currentLevel = rewardState.getLevel();
    if (isWin) {
        rewards['win'] = rewardState.getWinBonus();
    } else {
        rewards['loss'] = rewardState.getLossBonus();
    }
    
    let now = new Date();
    // Make now be 3 am today so streaks always reset at the same time.
    now.setHours(3, 0, 0, 0);
    
    // First game of day bonus
    let firstGameOfDayBonus = rewardState.getFirstGameOfDayBonus(now);
    if (firstGameOfDayBonus > 0) {
        rewards['firstGameOfDay'] = firstGameOfDayBonus;
    }
    rewardState.firstGameOfDayBonusDate = now;

    // Streak bonus
    let streakBonus = rewardState.getStreakBonus(now);
    if (streakBonus > 0) {
        rewards['streak'] = streakBonus
    }
    if (rewardState.streakStartDate === null || !rewardState.hasStreak(now)) {
        rewardState.streakStartDate = now;
    }
    rewardState.streakEndDate = now

    // Add up the XP
    let totalXP = 0;
    for (let key in rewards) {
        totalXP += rewards[key];
    }
    rewardState.xp += totalXP;
    rewards['total'] = totalXP;

    // Level up if needed.
    let newLevel = rewardState.getLevel();
    if (newLevel > currentLevel) {
        rewards['levelUp'] = newLevel;
        let avatar = rewardState.getRandomNotOwnedAvatar();
        if (avatar !== null) {
            rewardState.addAvatar(avatar);
            rewards['newAvatar'] = avatar;
        }
    }
    rewardState.save();
    return rewards;
}

// ---- Display the rewards
function showRewards(isWin) {
    const rewardOverlay = document.getElementById('reward-overlay'); 
    const rewardsList = document.getElementById('rewardsList');
    const gameResult = document.getElementById('rewardGameResult');
    const totalReward = document.getElementById('totalReward');

    
    rewards = applyReward(isWin);

    gameResult.textContent = isWin ? 'Victory!' : 'Game Over';

    rewardsList.innerHTML = '';
    for (const [key, value] of Object.entries(rewards)) {
        if (key !== 'total') {
            const rewardItem = document.createElement('div');
            rewardItem.className = 'reward-item';
            rewardItem.innerHTML = `
                <span class="reward-label">
                    <img src="${getIconUrl(key)}" alt="${key}" class="icon">
                    ${formatRewardLabel(key)}
                </span>
                <span>${value}</span>
            `;
            rewardsList.appendChild(rewardItem);
        }
    }

    totalReward.innerHTML = `
        <span class="reward-label">
            <img src="${getIconUrl('total')}" alt="total" class="icon">
            Total XP Earned
        </span>
        <span>${rewards.total}</span>
    `;

    rewardOverlay.classList.remove('hidden');
    showPlayerXp();
}

function formatRewardLabel(key) {
    const labels = {
        win: 'Win Bonus',
        loss: 'XP Bonus',
        firstGameOfDay: 'First Game of Day',
        streak: 'Streak Bonus',
        levelUp: 'Level Up',
        newAvatar: 'New Avatar'
    };
    return labels[key] || key;
}

function getIconUrl(key) {
    // Replace these with actual icon URLs in a real implementation
    const icons = {
        win: '/api/placeholder/24/24',
        loss: '/api/placeholder/24/24',
        firstGameOfDay: '/api/placeholder/24/24',
        streak: '/api/placeholder/24/24',
        levelUp: '/api/placeholder/24/24',
        newAvatar: '/api/placeholder/24/24',
        total: '/api/placeholder/24/24'
    };
    return icons[key] || '/api/placeholder/24/24';
}

function showPlayerXp() {
    // Shows info about the player's current XP on the main UI, including its Xp number and avatar.
    const rewardState = RewardState.load()
    const avatarDiv = document.getElementById('avatar'); 
    const xpDiv = document.getElementById('current-xp');
    xpDiv.textContent = rewardState.xp + " XP";
    avatarDiv.innerHTML = `<img src="${rewardState.selectedAvatar}" alt="avatar"></img>`
    
}