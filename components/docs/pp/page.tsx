export default function PpPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-6">
        <div className="bg-white rounded-lg shadow-sm p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Privacy Policy</h1>
          
          <div className="prose prose-gray max-w-none">
            <p className="text-gray-600 mb-6">
              Thank you for choosing Latios! Protecting your privacy is important to us. This Privacy Policy explains how we collect, use, disclose, and protect your personal information through the Latios website, mobile application, and related services (collectively, the "Services").
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">Information We Collect</h2>
            <p className="text-gray-600 mb-4">
              We only collect personal information that is necessary for providing the Services. The categories of information we collect can include:
            </p>
            <ul className="list-disc pl-6 text-gray-600 mb-6 space-y-2">
              <li><strong>Account information:</strong> We collect information such as your name, email address, and password when you create a Latios account.</li>
              <li><strong>Usage information:</strong> We collect information about how you interact with the Services, such as podcasts summarized, summaries generated, account preferences, and features used.</li>
              <li><strong>Device information:</strong> We may collect information about the device and software you use to access the Services, such as IP address, browser type, operating system version, and app version.</li>
              <li><strong>Audio data:</strong> With your permission, we may collect audio data from podcast episodes for the purpose of generating summaries and transcriptions. This data is analyzed by our AI system and not retained.</li>
              <li><strong>Search and interaction data:</strong> We collect information about your search queries, podcast subscriptions, and content preferences to provide personalized recommendations.</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">How We Use Information</h2>
            <p className="text-gray-600 mb-4">We use the information we collect to:</p>
            <ul className="list-disc pl-6 text-gray-600 mb-6 space-y-2">
              <li>Provide, maintain, and improve the Services</li>
              <li>Create and deliver podcast summaries and transcriptions to you</li>
              <li>Generate personalized podcast recommendations</li>
              <li>Communicate with you, such as by sending you announcements and notifications</li>
              <li>Understand usage trends to analyze and improve the Services</li>
              <li>Comply with legal obligations and enforce our Terms of Service</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">Data Sharing and Disclosure</h2>
            <p className="text-gray-600 mb-4">
              We do not sell your personal information to third parties. We only disclose information with third parties to:
            </p>
            <ul className="list-disc pl-6 text-gray-600 mb-6 space-y-2">
              <li>Provide and improve the Services (e.g., AI processing, cloud storage)</li>
              <li>Comply with legal obligations</li>
              <li>Protect rights and safety</li>
              <li>With your explicit consent</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">Your Choices</h2>
            <p className="text-gray-600 mb-4">You have the following rights regarding your personal information:</p>
            <ul className="list-disc pl-6 text-gray-600 mb-6 space-y-2">
              <li><strong>Access and Download:</strong> You may access and download your Latios account information at any time.</li>
              <li><strong>Delete Account:</strong> You may choose to have your account deactivated and data deleted.</li>
              <li><strong>Audio Data Control:</strong> For audio data collected from podcasts, you can revoke permission at any time within the Latios app settings. This will immediately cease analysis and summarization for that podcast.</li>
              <li><strong>Communication Preferences:</strong> You can control how we communicate with you through your account settings.</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">Our Commitment to Security</h2>
            <p className="text-gray-600 mb-4">
              We employ appropriate technical and organizational measures to protect your information. Data is stored in secured facilities and transmitted using encryption. While we work hard to protect your privacy, we cannot guarantee the security of all transmitted information.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">Data Retention</h2>
            <p className="text-gray-600 mb-4">
              We retain your personal information for as long as necessary to provide the Services and fulfill the purposes outlined in this Privacy Policy. Audio data used for analysis is not retained after processing.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">International Data Transfers</h2>
            <p className="text-gray-600 mb-4">
              Your information may be transferred to and processed in countries other than your own. We ensure appropriate safeguards are in place to protect your data in accordance with this Privacy Policy.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">Children's Privacy</h2>
            <p className="text-gray-600 mb-4">
              Our Services are not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">Changes to this Policy</h2>
            <p className="text-gray-600 mb-4">
              We may occasionally update this Policy to comply with laws and reflect improvements to our Services. Please check the Policy each time you use Latios to stay updated.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">Contact Us</h2>
            <p className="text-gray-600 mb-6">
              If you have any questions about this Privacy Policy or our data practices, please contact us at: <a href="mailto:team@surrealx.ai" className="text-blue-600 hover:text-blue-800">team@surrealx.ai</a>
            </p>

            <div className="border-t border-gray-200 pt-6 mt-8">
              <p className="text-sm text-gray-500">© 2025 Latios. All Rights Reserved.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 