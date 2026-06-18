import React from 'react'
import {
    FaFilter,
    //getTrendIcon
} from "react-icons/fa";
import { usePreferences } from '../hooks/usePreferences';

export default function Catagory({ catagoryData }) {
    const { formatCurrency } = usePreferences();
    return (
        <div className="card border-0 shadow-sm">
            <div className="card-header bg-transparent border-0 pt-3">
                <div className="d-flex justify-content-between align-items-center">
                    <h5 className="mb-0">Category Analysis</h5>
                </div>
            </div>
            <div className="card-body pt-2">
                {catagoryData.map((category, index) => (
                    <div key={index} className="mb-4">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                            <div className="d-flex align-items-center gap-2">
                                <span className="fw-medium">{category.category}</span>
                                {/* {getTrendIcon(category.trend)} */}
                                {/* <small className={`${category.trend > 0 ? 'text-danger' : 'text-success'}`}>
                                    {Math.abs(category.trend)}%
                                </small> */}
                            </div>
                            <div className="text-end">
                                <span className="fw-bold">{formatCurrency(category.amount)}</span>
                                <small className="text-muted d-block">{category.percentage}% of total</small>
                            </div>
                        </div>
                        <div className="progress" style={{ height: '8px' }}>
                            <div
                                className={`progress-bar bg-${category.color}`}
                                style={{ width: `${category.percentage}%` }}
                            ></div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
