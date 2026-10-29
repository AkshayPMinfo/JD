export const JD_MIN_WORDS = 50;
export const JD_MAX_WORDS = 5000;

/** Phrases a job post uses to talk to the reader; a resume almost never does. */
const JD_VOICE = /\b(you will|you'll|you would|we are looking|we're looking|we are seeking|join us|join our|apply|applicants?|candidates?|about the (job|role)|what you will|what you'll|the role|this role)\b/i;

export function validateJobDescriptionText(jdText: string) {
  const normalizedText = jdText.replace(/\s+/g, " ").trim();
  const words = normalizedText.match(/\b[\w'+.-]+\b/g) || [];
  const lowerText = normalizedText.toLowerCase();

  const indicatorChecks = [
    { name: "Responsibilities", matched: /\b(responsibilities|responsibility|duties|what you'?ll do|what you will do|day[-\s]?to[-\s]?day|key tasks|deliverables)\b/i.test(normalizedText) },
    { name: "Requirements", matched: /\b(requirements|required|must have|minimum qualifications|basic qualifications|candidate should|you should have|what you will bring|what you'll bring)\b/i.test(normalizedText) },
    { name: "Qualifications", matched: /\b(qualifications|qualified|eligibility|background|degree|bachelor|master|mba|education)\b/i.test(normalizedText) },
    { name: "Skills", matched: /\b(skills|competencies|proficiency|expertise|tools|technologies|tech stack|knowledge of)\b/i.test(normalizedText) },
    { name: "Experience", matched: /\b(experience|years of experience|professional experience|worked with|track record)\b/i.test(normalizedText) },
    { name: "Role Description", matched: /\b(role description|about the role|about the job|job description|position overview|the role|role summary|job summary|we are looking for|we're looking for)\b/i.test(normalizedText) },
    { name: "Preferred Skills", matched: /\b(preferred|nice to have|good to have|bonus|plus|preferred qualifications)\b/i.test(normalizedText) },
    { name: "Education Requirements", matched: /\b(education requirements|degree required|bachelor'?s degree|master'?s degree|educational background)\b/i.test(normalizedText) },
  ];
  const foundIndicators = indicatorChecks.filter(i => i.matched).map(i => i.name);

  const isLoremIpsum = /\blorem ipsum\b|\bdolor sit amet\b|\bconsectetur adipiscing\b/i.test(lowerText);
  const isCoverLetter = /\b(dear hiring manager|dear recruiter|dear sir|dear madam|writing to apply|express my interest|my attached resume|my resume|yours sincerely|sincerely,)/i.test(lowerText);
  // A resume has the person's own contact details (a real email address or phone number), not just the word "email".
  // Job posts mention "certifications", "email security" or "university" too, so section words alone prove nothing.
  const hasContact = /[\w.+-]+@[\w-]+\.[\w.]+/.test(jdText) || /(?:^|\s)\+?\d[\d\s().-]{8,}\d(?=\s|$)/m.test(jdText);
  const hasResumeSections = /\b(work experience|professional experience|education|skills|certifications|projects|summary of qualifications)\b/i.test(lowerText);
  const isResume = hasContact && hasResumeSections && !JD_VOICE.test(normalizedText);

  const isValid =
    words.length >= JD_MIN_WORDS &&
    words.length <= JD_MAX_WORDS &&
    foundIndicators.length >= 2 &&
    !isLoremIpsum &&
    !isCoverLetter &&
    !isResume;

  return {
    isValid,
    wordCount: words.length,
    foundIndicators,
    isTooLong: words.length > JD_MAX_WORDS,
    isTooShort: words.length < JD_MIN_WORDS,
    isLoremIpsum,
    isCoverLetter,
    isResume
  };
}
