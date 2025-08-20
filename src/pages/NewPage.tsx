// src/pages/NewPage.tsx
const NewPage = () => {
  return (
    <div className="page-container">
      <h1>Welcome to the New Page</h1>
      <p>This is a new page in your React TypeScript application.</p>
      <div className="content-box">
        <h2>About This App</h2>
        <p>This application helps you create structured learning paths for any topic you want to study.</p>
        <ul>
          <li>Enter any subject you want to learn</li>
          <li>The AI generates a customized 8-step learning path</li>
          <li>Click on each module to get detailed content</li>
          <li>Track your progress through complex topics</li>
        </ul>
      </div>
    </div>
  );
};

export default NewPage;