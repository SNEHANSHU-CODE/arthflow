import { useCallback } from 'react';
import { useSelector } from 'react-redux';
import { useMutation } from '@apollo/client';
import { gql } from '@apollo/client';

/**
 * GraphQL Mutation for PDF Report Generation
 */
const GENERATE_FINANCIAL_REPORT = gql`
  mutation GenerateFinancialReport($startDate: String!, $endDate: String!, $currencySymbol: String) {
    generateFinancialReport(startDate: $startDate, endDate: $endDate, currencySymbol: $currencySymbol) {
      success
      message
      fileName
      filePath
    }
  }
`;

/**
 * Custom Hook for PDF Report Generation
 * Supports both GraphQL and REST API methods
 */
export const usePdfReportGeneration = () => {
  const { accessToken } = useSelector(state => state.auth);
  
  // GraphQL Mutation
  const [generateReportGraphQL, { loading: graphQLLoading, error: graphQLError }] = useMutation(
    GENERATE_FINANCIAL_REPORT
  );

  /**
   * Generate PDF report via GraphQL
   * Returns: { success, message, fileName, filePath }
   */
  const generateReportViaGraphQL = useCallback(
    async (startDate, endDate, currencySymbol = '₹') => {
      try {
        const { data } = await generateReportGraphQL({
          variables: { startDate, endDate, currencySymbol },
          context: {
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          }
        });

        if (data?.generateFinancialReport?.success) {
          return {
            success: true,
            message: data.generateFinancialReport.message,
            fileName: data.generateFinancialReport.fileName,
            filePath: data.generateFinancialReport.filePath
          };
        } else {
          throw new Error(data?.generateFinancialReport?.message || 'Failed to generate report');
        }
      } catch (error) {
        throw error;
      }
    },
    [generateReportGraphQL, accessToken]
  );

  /**
   * Generate PDF report via REST API
   * Returns: Blob (file data)
   * 
   * Advantage: Direct download, no file storage on server
   * Disadvantage: Slightly more complex client-side handling
   */
  const generateReportViaREST = useCallback(
    async (startDate, endDate) => {
      try {
        // Use API Gateway endpoint
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

        const response = await fetch(
          `${apiUrl}/pdf/generate-report`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({ startDate, endDate })
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to generate report');
        }

        // Get filename from Content-Disposition header
        const contentDisposition = response.headers.get('content-disposition');
        let fileName = 'financial_report.pdf';
        
        if (contentDisposition) {
          const fileNameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
          if (fileNameMatch) fileName = fileNameMatch[1];
        }

        const blob = await response.blob();
        
        // Trigger download
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        
        // Cleanup
        window.URL.revokeObjectURL(url);
        document.body.removeChild(link);

        return {
          success: true,
          message: 'Report downloaded successfully',
          fileName: fileName
        };
      } catch (error) {
        throw error;
      }
    },
    [accessToken]
  );

  /**
   * Main method: Generate report
   * Uses REST API by default (direct download)
   * Set method='graphql' to use GraphQL
   */
  const generateReport = useCallback(
    async (startDate, endDate, method = 'rest') => {
      if (method === 'graphql') {
        return generateReportViaGraphQL(startDate, endDate);
      } else {
        return generateReportViaREST(startDate, endDate);
      }
    },
    [generateReportViaGraphQL, generateReportViaREST]
  );

  return {
    generateReport,
    generateReportViaGraphQL,
    generateReportViaREST,
    loading: graphQLLoading,
    error: graphQLError
  };
};

export default usePdfReportGeneration;
