// src/pages/LearningPath.tsx
import { useState } from "react";
import WhiteInfoBox from "../components/WhiteInfoBox";
import DarkenUI from "../components/DarkenUI";
import { generateModuleData, getDetailedContent } from "../services/aiService";

interface CellData {
  title: string;
  content: string;
  isLoading: boolean;
  fullContent: string | null;
}

const LearningPath = () => {
  const [activeCell, setActiveCell] = useState<number | null>(null);
  const [expandedCell, setExpandedCell] = useState<number | null>(null);
  const [topic, setTopic] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [cells, setCells] = useState<CellData[]>(Array(8).fill(null).map(() => ({
    title: "Click to generate",
    content: "Enter a topic above to create a learning path",
    isLoading: false,
    fullContent: null
  })));

  const handleCellClick = async (index: number) => {
    setActiveCell(index);
    
    // If we already have full content, don't regenerate
    if (cells[index].fullContent) return;
    
    // Generate detailed content for this cell
    if (topic) {
      const updatedCells = [...cells];
      updatedCells[index].isLoading = true;
      setCells(updatedCells);
      
      try {
        const content = await getDetailedContent(topic, cells[index].title, index + 1);
        updatedCells[index].fullContent = content;
        updatedCells[index].isLoading = false;
        setCells(updatedCells);
      } catch (error) {
        console.error("Error generating cell content:", error);
        updatedCells[index].isLoading = false;
        setCells(updatedCells);
      }
    }
  };

  const handleCellHover = (index: number) => {
    setExpandedCell(index);
  };

  const handleCellLeave = () => {
    setExpandedCell(null);
  };

  const handleTopicSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    
    setIsGenerating(true);
    
    try {
      // Generate module data using our AI service
      const moduleData = await generateModuleData(topic);
      
      // Update cells with new data
      const updatedCells = moduleData.map((data, index) => ({
        title: data.title,
        content: data.content,
        isLoading: false,
        fullContent: null // Will be generated when clicked
      }));
      
      setCells(updatedCells);
    } catch (error) {
      console.error("Error generating learning path:", error);
      alert("Failed to generate learning path. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="app-container">
      <DarkenUI 
        isActive={activeCell !== null} 
        onClick={() => setActiveCell(null)} 
      />

      <WhiteInfoBox isOpen={activeCell !== null}>
        {activeCell !== null && (
          <>
            <h2>{cells[activeCell].title}</h2>
            <p>{cells[activeCell].fullContent || cells[activeCell].content}</p>
            {cells[activeCell].isLoading && <div className="content-loading">Generating detailed content...</div>}
          </>
        )}
      </WhiteInfoBox>

      {/* Topic Input */}
      <div className="topic-input-container">
        <form onSubmit={handleTopicSubmit} className="topic-form">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="What do you want to learn? (e.g., Knitting, Python, Photography)"
            disabled={isGenerating}
          />
          <button type="submit" disabled={isGenerating || !topic.trim()}>
            {isGenerating ? "Generating..." : "Create Learning Path"}
          </button>
        </form>
        <p className="api-info">
          Using local AI generator. This mockup uses Hugging Face API which currently does not work. Type 'Cooking' to understand the intent of this idea. Thank you.
        </p>
      </div>

      {/* Main content with horizontal scrolling */}
      <div className="main-content">
        <div className="cells-connector"></div>
        <div className="cells-scroll-container">
          <div className="cells-container">
            {cells.map((cell, index) => (
              <div
                key={index}
                className={`cell cell-${index + 1} ${expandedCell === index ? 'expanded' : ''}`}
                onClick={() => handleCellClick(index)}
                onMouseEnter={() => handleCellHover(index)}
                onMouseLeave={handleCellLeave}
              >
                <div className="cell-header">
                  <span className="cell-number">{(index + 1).toString().padStart(2, '0')}</span>
                  <h3 className="cell-title">{cell.title}</h3>
                </div>
                {cell.isLoading && <div className="cell-loading">Generating content...</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LearningPath;