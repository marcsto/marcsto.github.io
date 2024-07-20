
function showFeedbackForm() {

    let winnerSide = getWinnerFen(currentFEN);
    let winner = "unknown";
    let difficulty = "unknown";

    if (document.getElementById('aiw').checked) {
        difficulty = document.getElementById('ai-strength-w').value;
        if (winnerSide === 'w') {
            winner = 'I lost';
        } else {
            winner = 'I won';
        }
    } else if (document.getElementById('aib').checked) {
        difficulty = document.getElementById('ai-strength-b').value;
        if (winnerSide === 'b') {
            winner = 'I lost';
        } else {
            winner = 'I won';
        }
    } else {
        difficulty = "None: I played against another human"
    }
    if (!winnerSide) {
        winner = "unknown"
    }
    
    // Get the player ID from the cookies. If it doesn't exist, generate a new UUID.
    let feedbackNumber = getOrCreateFeedbackNumber();

    const kingSuccessDropdown = document.getElementById("king-success-variants");
    const probDropdown = document.getElementById("prob-variants");

    const kingSuccessVariant = kingSuccessDropdown.value !== kingSuccessDropdown.options[0].value ? kingSuccessDropdown.value : "";
    const probVariant = probDropdown.value !== probDropdown.options[0].value ? probDropdown.value : "";

    const feedbackUrl = _generateFeedbackUrl(winner, kingSuccessVariant, probVariant, difficulty, feedbackNumber);
    const surveyIframe = document.getElementById("survey-iframe");
    surveyIframe.src = feedbackUrl;

    const surveyContainer = document.getElementById("survey-container");
    surveyContainer.classList.remove("hidden");
    console.log(feedbackUrl)
    // Print all parameters
    console.log("Winner: ", winner, "King Success Variant: ", kingSuccessVariant, "Probability Variant: ", probVariant, "Difficulty: ", difficulty, "Feedback Number: ", feedbackNumber);
}

function _generateFeedbackUrl(winner, kingSuccessVariant, probVariant, difficulty, feedbackNumber) {
    const baseUrl = "https://docs.google.com/forms/d/e/1FAIpQLSf8NadbkK9HQ_EVPbosPIdJgtIgs-AZfkMtnz3kJ_s6RciYCw/viewform?usp=pp_url";
    const params = new URLSearchParams();

    // Append each form entry field
    params.append("entry.2005954890", winner);  // Replace with actual field ID for "Who won?"
    if (kingSuccessVariant) {
        params.append("entry.898029986", kingSuccessVariant); // Replace with actual field ID for "King Success Variant"
    }
    if (probVariant) {
        params.append("entry.898029986", probVariant); // Replace with actual field ID for "Probability Variant"
    }
    params.append("entry.1666966763", difficulty); // Replace with actual field ID for "Difficulty"
    params.append("entry.1774487819", feedbackNumber); // Replace with actual field ID for "Game ID"
    params.append("embedded", "true");
    return `${baseUrl}&${params.toString()}`;
}

function getOrCreateFeedbackNumber() {
    const cookieName = 'feedbackNumber';
    let feedbackNumber = getCookie(cookieName);
    
    if (!feedbackNumber) {
      // Generate a new feedback number
      feedbackNumber = generateFeedbackNumber();
      document.cookie = `${cookieName}=${feedbackNumber}; path=/; max-age=31536000000`; // ~1000 years
    }
    
    return feedbackNumber;
  }
  
  // Helper function to get a cookie by name
  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
  }
  
  // Helper function to generate a feedback number
  function generateFeedbackNumber() {
    // Generate a random 10-digit number
    return Math.floor(1000000000 + Math.random() * 9000000000).toString();
  }